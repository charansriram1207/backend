require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Nodemailer transporter
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  family: 4, // Force IPv4 to prevent IPv6 DNS resolution timeouts on Render/cloud networks
  connectionTimeout: 15000,
  greetingTimeout: 15000,
});

// Verify connection configuration
transporter.verify((error) => {
  if (error) {
    console.error('[SMTP] Connection configuration failed:', error);
  } else {
    console.log('[SMTP] Server is ready to deliver messages');
  }
});

// Endpoint to log offsite visit starts and send email notifications
app.post('/api/audit/offsite-start', async (req, res) => {
  console.log(`[API] Received offsite-start request at ${new Date().toISOString()}`);
  console.log('[API] Request body:', JSON.stringify(req.body, null, 2));

  const {
    driverName,
    helperNames,
    visitId,
    customerName,
    distanceMeters,
    startedAt,
    driverLocation,
    customerLocation,
    routeName,
  } = req.body;

  // Simple validation
  if (!driverName || !visitId || !customerName) {
    const errorMsg = `Missing required fields (driverName: ${driverName}, visitId: ${visitId}, customerName: ${customerName})`;
    console.error('[API] Validation failed:', errorMsg);
    return res.status(400).json({ error: errorMsg });
  }

  const formattedDistance = distanceMeters 
    ? `${(distanceMeters / 1000).toFixed(2)} km (${distanceMeters} meters)` 
    : 'Unknown';

  const dateString = startedAt 
    ? new Date(startedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) 
    : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const helpersList = Array.isArray(helperNames) && helperNames.length > 0 
    ? helperNames.join(', ') 
    : 'None declared';

  const formattedRouteName = routeName || 'Not specified';

  // Beautiful HTML Email body
  const mailOptions = {
    from: `"Pushpak Geofence Alert" <${process.env.SMTP_USER}>`,
    to: process.env.REPORT_RECEIVER_EMAIL,
    subject: `🚨 Geofence Alert: Off-site Visit Started - ${driverName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px; background-color: #F8FAFC;">
        <h2 style="color: #EF4444; margin-top: 0;">🚨 Off-site Visit Start Notification</h2>
        <p style="color: #334155; font-size: 16px;">This is an automated alert indicating that a driver started a customer visit outside of the standard 300-meter geofence boundary.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Driver Name</td>
            <td style="padding: 10px 0; color: #1E293B;">${driverName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Helpers</td>
            <td style="padding: 10px 0; color: #1E293B;">${helpersList}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Route Name</td>
            <td style="padding: 10px 0; color: #1E293B; font-weight: 600;">${formattedRouteName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Customer Name</td>
            <td style="padding: 10px 0; color: #1E293B;">${customerName} (Visit ID: ${visitId})</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Distance Offsite</td>
            <td style="padding: 10px 0; font-weight: bold; color: #EF4444;">${formattedDistance}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Start Time</td>
            <td style="padding: 10px 0; color: #1E293B;">${dateString} (IST)</td>
          </tr>
          ${driverLocation ? `
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Driver Coordinates</td>
            <td style="padding: 10px 0; color: #1E293B;">Lat: ${driverLocation.latitude}, Lng: ${driverLocation.longitude}</td>
          </tr>` : ''}
          ${customerLocation ? `
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 0; font-weight: bold; color: #475569;">Customer Coordinates</td>
            <td style="padding: 10px 0; color: #1E293B;">Lat: ${customerLocation.latitude}, Lng: ${customerLocation.longitude}</td>
          </tr>` : ''}
        </table>
        
        <div style="margin-top: 30px; padding: 15px; border-radius: 6px; background-color: #FEF2F2; border-left: 4px solid #EF4444;">
          <strong style="color: #EF4444;">Note:</strong> The driver was located at a distance of ${formattedDistance} from the customer's registered location at the time of tapping "Start Visit".
        </div>
      </div>
    `,
  };

  // Try to send via Telegram if configured, otherwise fallback to Email
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (telegramBotToken && telegramChatId && telegramChatId !== 'YOUR_CHAT_ID_HERE') {
    try {
      console.log(`[Telegram] Sending notification for visit ${visitId} to chat ${telegramChatId}`);
      
      const messageText = `
<b>🚨 Geofence Alert: Off-site Visit Started</b>

👤 <b>Driver Name:</b> ${driverName}
👥 <b>Helpers:</b> ${helpersList}
📍 <b>Route Name:</b> <code>${formattedRouteName}</code>
🏢 <b>Customer:</b> ${customerName} (Visit ID: ${visitId})
📏 <b>Distance Offsite:</b> <b>${formattedDistance}</b>
🕒 <b>Start Time:</b> ${dateString} (IST)
${driverLocation ? `🌐 <b>Driver:</b> Lat: ${driverLocation.latitude}, Lng: ${driverLocation.longitude}` : ''}
${customerLocation ? `🌐 <b>Customer:</b> Lat: ${customerLocation.latitude}, Lng: ${customerLocation.longitude}` : ''}

⚠️ <i>Note: The driver was located at a distance of ${formattedDistance} from the customer's registered location at the time of tapping "Start Visit".</i>
      `.trim();

      const tgResponse = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: messageText,
          parse_mode: 'HTML',
        }),
      });

      if (!tgResponse.ok) {
        const tgErrText = await tgResponse.text();
        throw new Error(`Telegram API returned status ${tgResponse.status}: ${tgErrText}`);
      }

      const tgResult = await tgResponse.json();
      console.log(`[Telegram] Success! Message sent:`, tgResult.result?.message_id);
      return res.status(200).json({ success: true, method: 'telegram', messageId: tgResult.result?.message_id });
    } catch (tgError) {
      console.error('[Telegram] Failed to send telegram notification:', tgError);
      console.log('[Fallback] Proceeding to fallback email notification...');
    }
  }

  try {
    console.log(`[Email] Attempting to send email for visit ${visitId} from ${process.env.SMTP_USER} to ${process.env.REPORT_RECEIVER_EMAIL}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Success! Notification sent for visit ${visitId}:`, info.messageId);
    return res.status(200).json({ success: true, method: 'email', messageId: info.messageId });
  } catch (error) {
    console.error(`[Email] Failed to send email for visit ${visitId}:`, error);
    if (error && error.stack) {
      console.error('[Email] Error stack trace:', error.stack);
    }
    return res.status(500).json({ error: 'Failed to send automated email notification', details: error.message });
  }
});

// Basic Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Pushpak Email backend listening on port ${PORT}`);
});

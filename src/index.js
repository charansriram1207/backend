require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint to log offsite visit starts and send Telegram notifications
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

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramBotToken || !telegramChatId || telegramChatId === 'YOUR_CHAT_ID_HERE') {
    const errorMsg = 'Telegram configuration is missing or incomplete (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set)';
    console.error('[Telegram] Config error:', errorMsg);
    return res.status(500).json({ error: errorMsg });
  }

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
    if (tgError && tgError.stack) {
      console.error('[Telegram] Error stack trace:', tgError.stack);
    }
    return res.status(500).json({ error: 'Failed to send Telegram notification', details: tgError.message });
  }
});

// Basic Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Pushpak Alert backend listening on port ${PORT}`);
});

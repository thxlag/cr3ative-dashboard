import fs from 'fs';
import readline from 'readline';
import { google } from 'googleapis';

// If modifying these scopes, delete previously saved tokens
const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];
const TOKEN_PATH = 'youtube_token.json';

// Load client secrets from a local file.
export function sendYouTubeMessage(liveChatId, message) {
  return new Promise((resolve, reject) => {
    fs.readFile('client_secret.json', (err, content) => {
      if (err) return reject('Error loading client secret file:', err);
      authorize(JSON.parse(content), (auth) => {
        const youtube = google.youtube({ version: 'v3', auth });
        youtube.liveChatMessages.insert({
          part: 'snippet',
          requestBody: {
            snippet: {
              liveChatId,
              type: 'textMessageEvent',
              textMessageDetails: { messageText: message }
            }
          }
        }, (err, res) => {
          if (err) return reject('The API returned an error: ' + err);
          resolve(res.data);
        });
      });
    });
  });
}

function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

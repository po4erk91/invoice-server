const readline = require('readline');
const {google} = require('googleapis');
const fs = require('fs');

// If modifying these scopes, delete token.json.
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.metadata'
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'services/google/token.json';

createFolder = async () => {
  let content = fs.readFileSync('services/google/credentials.json', "utf8")
  let folderId = await authorize(JSON.parse(content), async (auth) => {
      const drive = google.drive('v3');
      const fileMetadata = {
        'name': `Invoices - ${new Date()}`,
        'mimeType': 'application/vnd.google-apps.folder'
      };
      const folder = await drive.files.create({
        auth: auth,
        resource: fileMetadata,
        fields: 'id'
      });
      return folder.data.id
  })
  return folderId
}

uploadInvoices = (invoicePath, folderId) => {
  fs.readFile('services/google/credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Drive API.
    authorize(JSON.parse(content), (auth) => {
      var drive = google.drive('v3');
      var fileMetadata = {
          'name': invoicePath,
          parents: [folderId]
      };
      var media = {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          body: fs.createReadStream(invoicePath)
      };
        drive.files.create({
            auth: auth,
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });
    });
  });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
authorize = async (credentials, callback) => {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  const token = fs.readFileSync(TOKEN_PATH,'utf8')
  oAuth2Client.setCredentials(JSON.parse(token));
  return await callback(oAuth2Client);
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

module.exports = {
  uploadInvoices,
  createFolder
}
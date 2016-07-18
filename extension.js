// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const
  AzureStorage = require('azure-storage'),
  moment = require('moment'),
  Promise = require('bluebird'),
  URL = require('url'),
  vscode = require('vscode');

const { BlobUtilities } = AzureStorage;

const { SharedAccessPermissions } = BlobUtilities;

const {
  Range,
  window
} = vscode;

const
  ACCOUNT_NAME_PATTERN = /^(.*?)\.(blob|file|queue|table)\.core\.windows\.net$/,
  CONTAINER_AND_BLOB_PATTERN = /^\/([^\/]+)\/(.*)$/;

const lastSecrets = {};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('azureStorage.buildSASURI', (textEditor, edit, args) => {
    const { document, selections } = textEditor;

    // The code you place here will be executed every time your command is executed
    if (!selections || !selections.length || emptyRange(textEditor.selection)) {
      return window.showErrorMessage('Please highlight one or more Azure Storage URI before running this command.');
    }

    const ignoreErrors = selections && selections.length > 1;

    const secrets = {};

    return (
      Promise.mapSeries(selections, selection => {
        const text = document.getText(new Range(selection.start, selection.end));

        return parseURL(text).then(url => {
          return parseBlobURL(url).then(locator => {
            const { accountName } = locator;

            let promise;

            if (secrets.hasOwnProperty(accountName)) {
              promise = Promise.resolve(secrets[accountName]);
            } else {
              promise = promptSecret(accountName).then(secret => {
                if (typeof secret === 'string') {
                  secrets[accountName] = secret;

                  return secret;
                } else {
                  throw new Error('user interrupted');
                }
              });
            }

            return promise.then(secret => ({
              locator,
              secret,
              selection,
              url
            }));
          });
        });
      })
      .then(urls => {
        return promptValidity().then(validity => {
          return promptPermissions().then(permissions => {
            return {
              permissions,
              urls,
              validity
            };
          });
        });
      })
      .then(options => {
        const now = Date.now();

        return (
          textEditor.edit(edit => {
            options.urls.forEach(entry => {
              if (!entry.secret) { return; }

              const { locator, url } = entry;

              const newURL = URL.format({
                auth: url.auth,
                hash: url.hash,
                host: url.host,
                pathname: url.pathname,
                protocol: url.protocol,
                search: generateSAS(
                  locator.accountName,
                  entry.secret,
                  locator.container,
                  locator.blob,
                  options.permissions,
                  new Date(now),
                  moment(now).add(options.validity).toDate()
                ),
                slashes: url.slashes
              });

              edit.replace(entry.selection, newURL);
            });
          })
        );
      })
      .catch(err => {
        window.showErrorMessage('Failed to build SAS URL token.', 'Show Details').then(action => {
          if (!action) { return; }

          const outputChannel = window.createOutputChannel('Azure Blob');

          outputChannel.appendLine(err.stack);
          outputChannel.show();
        });
      })
    )
  }));
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}

exports.deactivate = deactivate;

function emptyRange(range) {
  return positionEqual(range.start, range.end);
}

function positionEqual(x, y) {
  return (
    x.line === y.line
    && x.character === y.character
  );
}

function promptSecret(accountName, defaultValue) {
  return window.showInputBox({
    password: true,
    prompt: `Please enter secret for storage account "${ accountName }"`,
    validateInput: value => {
      if (!value) { return; }

      try {
        if (new Buffer(value, 'base64').length === 64) {
          return;
        }
      } catch (err) {}

      return 'Invalid secret';
    },
    value: lastSecrets[accountName]
  }).then(secret => {
    if (secret) {
      lastSecrets[accountName] = secret;
    }

    return secret;
  });
}

function parseURL(text) {
  return new Promise(resolve => resolve(URL.parse(text)));
}

function parseBlobURL(url) {
  return new Promise((resolve, reject) => {
    const
      accountNameMatch = ACCOUNT_NAME_PATTERN.exec(url.host),
      containerAndBlob = CONTAINER_AND_BLOB_PATTERN.exec(url.pathname);

    if (accountNameMatch) {
      resolve({
        accountName: accountNameMatch[1],
        container: containerAndBlob[1],
        blob: containerAndBlob[2]
      });
    } else {
      reject(new Error('cannot find account name, container, or blob'));
    }
  });
}

function parseAccountName(url) {
  return new Promise((resolve, reject) => {
    const accountNameMatch = ACCOUNT_NAME_PATTERN.exec(url.host);

    if (accountNameMatch) {
      resolve(accountNameMatch[1]);
    } else {
      // !ignoreErrors && window.showErrorMessage('Cannot find account name in URL');
      reject(new Error('cannot find account name'));
    }
  });
}

function promptValidity() {
  return window.showQuickPick([
    moment.duration(15, 'minutes'),
    moment.duration(30, 'minutes'),
    moment.duration(1, 'hour'),
    moment.duration(2, 'hours'),
    moment.duration(1, 'day'),
    moment.duration(1, 'week'),
    moment.duration(1, 'month'),
    moment.duration(3, 'months'),
    moment.duration(1, 'year'),
    moment.duration(10, 'years'),
    moment.duration(100, 'years')
  ].map(duration => ({
    duration,
    label: `Valid for ${ duration.humanize() }`,
    detail: `Until ${ moment(Date.now()).add(duration).format('LLLL' ) }`
  })), {
    placeholder: 'Validity of the SAS URL token'
  }).then(item => item.duration)
}

function promptPermissions() {
  return window.showQuickPick([{
    label: 'Read-only',
    permission: SharedAccessPermissions.READ
  }, {
    label: 'Write',
    permission:
      SharedAccessPermissions.READ +
      SharedAccessPermissions.ADD +
      SharedAccessPermissions.CREATE +
      SharedAccessPermissions.WRITE
  }, {
    label: 'Full',
    permission:
      SharedAccessPermissions.READ +
      SharedAccessPermissions.ADD +
      SharedAccessPermissions.CREATE +
      SharedAccessPermissions.WRITE +
      SharedAccessPermissions.DELETE
  }], {
    placeHolder: 'Permissions permitted on the shared resource'
  }).then(item => item.permission)
}

function generateSAS(accountName, secret, container, blob, permissions, start, expiry) {
  const blobService = AzureStorage.createBlobService(accountName, secret);

  return blobService.generateSharedAccessSignature(
    container,
    blob,
    {
      AccessPolicy: {
        Permissions: permissions,
        Start: start,
        Expiry: expiry
      }
    }
  );
}
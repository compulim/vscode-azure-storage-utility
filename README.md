# Azure Storage Utility
Generates Shared Access Signature for Azure Storage URI

## Usage
Highlights an URI which points to Azure Storage, e.g. http://accountname.blob.core.windows.net/container/myfile.ext. Then, run it thru Command Palette.
* Bring up Command Palette (`F1`, or `Ctrl+Shift+P` on Windows and Linux, or `Shift+CMD+P` on OSX)
* Type or select "Azure Storage: Build a SAS URI"

You can also add a keyboard shortcut with JSON below.
```
{
  "key": "ctrl+alt+shift+s",
  "command": "azureStorage.buildSASURI",
  "when": "editorTextFocus"
}
```

## Change log
* 0.0.1 (2016-07-18)
  * Initial commit

## Contributions
Love this extension? [Star](https://github.com/compulim/vscode-azure-storage-utility/stargazers) us!

Want to make this extension even more awesome? [Send us your wish](https://github.com/compulim/vscode-azure-storage-utility/issues/new/).

Hate how it is working? [File an issue](https://github.com/compulim/vscode-azure-storage-utility/issues/new/) to us.

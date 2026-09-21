# アプリアイコンの置き場所

`electron-builder` は `electron-builder.yml` の `buildResources` でこのディレクトリを参照します。
以下のファイルを置くと各 OS のパッケージに取り込まれます（無くてもビルドは通り、既定のアイコンになります）。

| ファイル    | 用途                          |
| ----------- | ----------------------------- |
| `icon.png`  | Linux（512×512 以上の正方形） |
| `icon.ico`  | Windows                       |
| `icon.icns` | macOS                         |

`icon.png` を 1 枚置いておけば electron-builder が他の形式を生成することもあります。

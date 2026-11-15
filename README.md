# Instant Translate

Safari extension: select text on any page and a translation pops up right next to it. No buttons, no API keys.

![Translation popup](docs/screenshot.png)

## How it works

`content.js` catches the text selection and shows the popup. `background.js` sends the text to Google Translate, which auto-detects the language. If the text is already in your target language, it is translated into your second language instead. Both languages are set from the toolbar menu.

On YouTube, click any word in the subtitles: the video pauses and the translation pops up. You can also translate the whole subtitle line or hear the word pronounced. Hovering over the subtitles pauses the video too.

## Install

```bash
xcodebuild -project "Instant Translate/Instant Translate.xcodeproj" -scheme "Instant Translate" -configuration Release -derivedDataPath build CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Apple Development" DEVELOPMENT_TEAM=<YOUR_TEAM_ID> build
ditto "build/Build/Products/Release/Instant Translate.app" "/Applications/Instant Translate.app"
open "/Applications/Instant Translate.app"
```

Then enable it in Safari → Settings → Extensions and allow it on all websites.

Selected text is sent to Google Translate.

## License

MIT

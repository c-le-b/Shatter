# Icons

Tauri requires these files to build with a custom icon:

| File | Size | Platform |
|---|---|---|
| `32x32.png` | 32×32 | Windows taskbar |
| `128x128.png` | 128×128 | Linux |
| `128x128@2x.png` | 256×256 | Linux HiDPI |
| `icon.ico` | multi-size | Windows (must include 256×256) |
| `icon.icns` | multi-size | macOS |
| `icon.png` | 512×512 | Source / fallback |

## Quickest path

1. Create or find a **512×512 PNG** of your icon — save it as `icon.png` here
2. Run the Tauri icon generator (requires the Tauri CLI already installed):

```bash
npm run tauri icon src-tauri/icons/icon.png
```

This auto-generates all the required sizes and formats from your single PNG.

## Without a custom icon

If you skip this step, Tauri uses its default icon. The build still works — just remove the `"icon"` array from `src-tauri/tauri.conf.json` to avoid build errors if the files are missing.

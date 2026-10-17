// Export native sizes from the approved artwork; no generative changes to the logo.
// Jimp is already supplied by Expo's image utilities. Project PNGs are consumed
// directly by EAS; this script is only needed when updating the source artwork.
const fs = require('node:fs/promises');
const path = require('node:path');
const Jimp = require('jimp-compact');

const root = path.resolve(__dirname, '..');
const at = relative => path.join(root, relative);

async function write(image, destination, opaque = false) {
  await fs.mkdir(path.dirname(at(destination)), { recursive: true });
  if (opaque) image.colorType(2);
  await image.writeAsync(at(destination));
  console.log(`${destination}: ${image.bitmap.width} x ${image.bitmap.height}`);
}

async function main() {
  const icon = await Jimp.read(at('assets/branding/sources/app-icon.png'));
  if (icon.bitmap.width !== icon.bitmap.height) throw new Error('The app icon source must be square.');
  await write(icon.clone().resize(1024, 1024, Jimp.RESIZE_BICUBIC), 'assets/icons/icon.png', true);
  await write(icon.clone().resize(512, 512, Jimp.RESIZE_BICUBIC), 'assets/store/google-play-icon.png', true);
  await write(icon.clone().resize(48, 48, Jimp.RESIZE_BICUBIC), 'assets/icons/favicon.png', true);

  // This transparent raster is the existing vector logo's export. Its entire
  // bounding rectangle fits in Android's central 66/108 safe circle at 520 px.
  const logo = await Jimp.read(at('assets/icons/logo-transparent.png'));
  const foreground = new Jimp(1024, 1024, 0x00000000);
  const mark = logo.clone().resize(520, Jimp.AUTO, Jimp.RESIZE_BICUBIC);
  foreground.composite(mark, Math.round((1024 - mark.bitmap.width) / 2), Math.round((1024 - mark.bitmap.height) / 2));
  await write(foreground, 'assets/icons/adaptive-icon.png');

  // Android uses the alpha silhouette when applying wallpaper/themed colours.
  const monochrome = foreground.clone();
  monochrome.scan(0, 0, 1024, 1024, function (x, y, index) {
    this.bitmap.data[index] = 255;
    this.bitmap.data[index + 1] = 255;
    this.bitmap.data[index + 2] = 255;
  });
  await write(monochrome, 'assets/icons/monochrome-icon.png');

  // A notification gets only a tiny system slot. Use the existing "ace" wordmark
  // without the much smaller .radio suffix, preserving its actual letter shapes.
  const notification = new Jimp(96, 96, 0x00000000);
  const ace = logo.clone().crop(0, 355, 455, 145).resize(84, Jimp.AUTO, Jimp.RESIZE_BICUBIC);
  ace.scan(0, 0, ace.bitmap.width, ace.bitmap.height, function (x, y, index) {
    this.bitmap.data[index] = 255;
    this.bitmap.data[index + 1] = 255;
    this.bitmap.data[index + 2] = 255;
  });
  notification.composite(ace, 6, Math.round((96 - ace.bitmap.height) / 2));
  await write(notification, 'assets/icons/notification-icon.png');

  // Keep the supplied portrait artwork intact for the responsive/web fallback.
  const splashPath = at('assets/branding/sources/splash.png');
  await fs.copyFile(splashPath, at('assets/splash/splash.png'));

  // Native launch screens need a centred square image rather than a stretched
  // portrait poster. Crop only the empty black margins; preserve the artwork.
  const splash = await Jimp.read(splashPath);
  const side = Math.min(splash.bitmap.width, splash.bitmap.height);
  splash.crop(Math.floor((splash.bitmap.width - side) / 2), Math.floor((splash.bitmap.height - side) / 2), side, side);
  await write(splash.resize(1024, 1024, Jimp.RESIZE_BICUBIC), 'assets/splash/splash-icon.png', true);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(root, "public");
const width = 1200;
const height = 630;

const background = Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#041630"/>
      <stop offset="0.58" stop-color="#07244b"/>
      <stop offset="1" stop-color="#064f88"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#0b75dc" stop-opacity=".55"/>
      <stop offset="1" stop-color="#0b75dc" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#001027" flood-opacity=".44"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1040" cy="115" r="330" fill="url(#glow)"/>
  <path d="M0 550 C240 490 355 635 640 570 C870 518 1008 567 1200 495 V630 H0Z" fill="#031126" opacity=".82"/>
  <path d="M0 0 H1200" stroke="#b8f000" stroke-width="12"/>

  <text x="70" y="224" fill="#b8f000" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="4">COURT RESERVATIONS, MADE CLEAR</text>
  <text x="66" y="310" fill="#ffffff" font-family="Arial, sans-serif" font-size="62" font-weight="800">Book your court.</text>
  <text x="70" y="361" fill="#7cc7ff" font-family="Arial, sans-serif" font-size="29" font-weight="700">Live availability. Simple booking.</text>
  <text x="70" y="408" fill="#d8e5f4" font-family="Arial, sans-serif" font-size="22">Choose a time, reserve your court, and rally.</text>

  <rect x="70" y="464" width="238" height="54" rx="27" fill="#b8f000"/>
  <circle cx="100" cy="491" r="8" fill="#041630"/>
  <circle cx="100" cy="491" r="15" fill="none" stroke="#041630" stroke-width="2" opacity=".35"/>
  <text x="126" y="498" fill="#041630" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="1">BOOKING OPEN</text>
  <text x="70" y="576" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="700">pickpointpickle.com</text>

  <g filter="url(#shadow)">
    <rect x="726" y="72" width="404" height="486" rx="30" fill="#f7fbff"/>
    <rect x="726" y="72" width="404" height="88" rx="30" fill="#ffffff"/>
    <path d="M726 132 H1130" stroke="#d5e2ef"/>
    <text x="762" y="112" fill="#0b6fd3" font-family="Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="2.5">TODAY'S COURTS</text>
    <text x="762" y="143" fill="#041630" font-family="Arial, sans-serif" font-size="19" font-weight="800">Find your perfect hour</text>

    <text x="762" y="205" fill="#4f6480" font-family="Arial, sans-serif" font-size="14" font-weight="700">COURT 1</text>
    <rect x="762" y="220" width="332" height="82" rx="18" fill="#eaf5ff" stroke="#79bbf5" stroke-width="2"/>
    <text x="784" y="252" fill="#041630" font-family="Arial, sans-serif" font-size="18" font-weight="800">2:00 PM – 3:00 PM</text>
    <text x="784" y="279" fill="#2678bf" font-family="Arial, sans-serif" font-size="14" font-weight="700">Reserved for your next rally</text>
    <rect x="1008" y="239" width="66" height="28" rx="14" fill="#041630"/>
    <text x="1022" y="258" fill="#b8f000" font-family="Arial, sans-serif" font-size="11" font-weight="800">BOOKED</text>

    <text x="762" y="350" fill="#4f6480" font-family="Arial, sans-serif" font-size="14" font-weight="700">COURT 2</text>
    <rect x="762" y="365" width="332" height="82" rx="18" fill="#ffffff" stroke="#cbd9e7" stroke-width="2"/>
    <text x="784" y="398" fill="#041630" font-family="Arial, sans-serif" font-size="18" font-weight="800">3:00 PM – 4:00 PM</text>
    <text x="784" y="425" fill="#4f6480" font-family="Arial, sans-serif" font-size="14">Ready to book</text>
    <rect x="1008" y="384" width="66" height="28" rx="14" fill="#b8f000"/>
    <text x="1020" y="403" fill="#041630" font-family="Arial, sans-serif" font-size="11" font-weight="800">OPEN</text>

    <rect x="762" y="483" width="332" height="45" rx="15" fill="#0879db"/>
    <text x="865" y="512" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="800">VIEW COURTS</text>
  </g>
  <circle cx="1149" cy="578" r="82" fill="none" stroke="#b8f000" stroke-width="3" opacity=".24"/>
  <circle cx="1149" cy="578" r="54" fill="none" stroke="#ffffff" stroke-width="2" opacity=".12"/>
</svg>`);

const mark = await sharp(path.join(publicDirectory, "pickpoint-mark-v4.png"))
  .resize({ width: 105, height: 94, fit: "contain" })
  .png()
  .toBuffer();

const wordmark = await sharp(path.join(publicDirectory, "pickpoint-wordmark-v3.png"))
  .resize({ width: 415, height: 139, fit: "contain" })
  .png()
  .toBuffer();

await sharp(background)
  .composite([
    { input: mark, left: 70, top: 36 },
    { input: wordmark, left: 192, top: 22 },
  ])
  .png({ compressionLevel: 9, palette: true, quality: 92 })
  .toFile(path.join(publicDirectory, "pickpoint-share-v1.png"));

console.log("Generated public/pickpoint-share-v1.png (1200×630)");

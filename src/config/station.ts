/** Frontend source of truth for station identity, audio URL and contact/social links. */
export const STATION = {
  name: "AceRadio",
  streamUrl: "https://studio.ace.radio/stream",
  tagline: "Built for those who listen differently.",
  location: "Cape Town, South Africa",
  website: "https://ace.radio",
  bookings: "https://bookings.ace.radio/",
  email: "studio@ace.radio",
  whatsapp: "https://wa.me/27730676204",
  social: {
    instagram: "https://www.instagram.com/ace.radio",
    tiktok: "https://www.tiktok.com/@ace.radio.za",
    facebook: "https://www.facebook.com/ace.radio.za",
    x: "https://x.com/aceradioza",
  },
} as const;

"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguage = "en" | "ta";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: (key: string) => string;
};

const STORAGE_KEY = "saree_app_language";

const TA: Record<string, string> = {
  "Dashboard": "முகப்புப்",
  "Orders": "ஆர்டர்கள்",
  "Add Order": "புதிய ஆர்டர்",
  "Product Codes": "புராடக்ட் கோட்ஸ்",
  "Product codes": "புராடக்ட் கோட்ஸ்",
  "Reports": "ரிப்போர்ட்ஸ்",
  "Settings": "செட்டிங்ஸ்",
  "Log out": "லாக் அவுட்",
  "Logout": "லாக் அவுட்",
  "Hello,": "ஹலோ,",
  "Hello": "ஹலோ",
  "Theme": "தீம்",
  "Dark": "டார்க்",
  "Light": "லைட்",
  "Save": "சேவ்",
  "Save & Apply": "சேமித்துச் செயல்படுத்து",
  "Reset to Default": "மீண்டும் பழைய நிலைக்கு மாற்ற",
  "Cancel": "ரத்து செய்",
  "Delete": "டெலீட்",
  "Edit": "எடிட்",
  "Download": "டவுன்லோட்",
  "Upload": "அப்லோட்",
  "Generate": "ஜெனரேட்",
  "Share via WhatsApp": "வாட்ஸ்அப் வழியாகப் பகிர",
  "Sync Now": "இப்போதே புதுப்பிக்கவும்",
  "Back": "பின் செல்ல",
  "Close": "மூட",
  "Try again": "மீண்டும் முயற்சி செய்",
  "Loading": "லோடிங்",
  "Saved": "சேமிக்கப்பட்டது",
  "Failed": "ஃபெயில்டு",
  "Today": "இன்று",
  "Yesterday": "நேற்று",
  "This Week": "இந்த வாரம்",
  "Last Week": "கடந்த வாரம்",
  "This Month": "இந்த மாதம்",
  "Last Month": "கடந்த மாதம்",
  "Quarter": "காலாண்டு",
  "Year": "ஆண்டு",
  "Custom": "விருப்பப்படியே",
  "Custom Range": "விருப்பப்படியே",
  "From": "முதல்",
  "To": "வரை",
  "To Date": "எந்த தேதி வரை?",
  "Booking date": "பதிவு செய்த தேதி",
  "Dispatched date": "அனுப்பி வைக்கப்பட்ட தேதி",
  "All Orders": "அனைத்து ஆர்டர்கள்",
  "Move to Dispatch": "அனுப்புதலுக்கு மாற்றுக",
  "TO (Customer)": "பெறுநர் (வாடிக்கையாளர்)",
  "FROM (Sender)": "அனுப்புநர்",
  "TO (customer address)": "பெறுநர் முகவரி",
  "FROM (our address)": "அனுப்புநர் முகவரி (நமது முகவரி)",
  "Product Details": "தயாரிப்பு விவரங்கள்",
  "Qty": "எத்தனை",
  "Qty (optional)": "எத்தனை",
  "Booked By": "பதிவு செய்தவர் (நமது)",
  "Booked mobile number": "பதிவு செய்தவரின் அலைபேசி எண் (நமது)",
  "Booked Mobile No": "பதிவு அலைபேசி எண் (நமது)",
  "Courier Name": "கூரியர்",
  "Tracking number": "டிராக்கிங் எண்",
  "Tracking / Consignment / LR Number": "டிராக்கிங் / கன்சைன்மென்ட் / LR எண்",
  "Tracking / Consignment / LR Number (optional)": "டிராக்கிங் / கன்சைன்மென்ட் / LR எண்",
  "Consignment number": "கன்சைன்மென்ட் எண்",
  "Recipient (To)": "பெறுநர்",
  "Order not found.": "ஆர்டர் கண்டறியப்படவில்லை",
  "Order not found": "ஆர்டர் கண்டறியப்படவில்லை",
  "Non-image files were skipped.": "படம் அல்லாத கோப்புகள் தவிர்க்கப்பட்டன",
  "Pending": "நிலுவை",
  "Dispatched": "அனுப்பப்பட்டது",
  "Total Orders": "டோட்டல் ஆர்டர்ஸ்",
  "Own": "நமது",
  "No change from the previous period.": "பழைய காலத்தில் இருந்து எந்த மாற்றமும் இல்லை",
  "Failed to load data": "டேட்டா லோட் ஆகவில்லை",
  "Admin": "அட்மின்",
  "Workers": "வேலை செய்பவர்கள்",
  "No workers yet.": "வேலை செய்பவர்கள் யாரும் இல்லை",
  "No workers yet": "வேலை செய்பவர்கள் யாரும் இல்லை",
  "PDF Settings": "PDF செட்டிங்ஸ்",
  "Printer Setup": "பிரிண்டர் செட்டப்",
  "Product Code Settings": "புராடக்ட் கோட் செட்டிங்ஸ்",
  "Content Type": "கன்டென்ட் டைப்",
  "Text size": "டெக்ஸ்ட் சைஸ்",
  "Logo Zoom": "லோகோ ஜூம்",
  "Y Position": "Y பொசிஷன்",
  "Live Preview": "லைவ் பிரிவியூ",
  "Sample Image": "சாம்பிள் இமேஜ்",
  "Manual Add (fallback)": "மேனுவல் ஆட் (ஃபால்பேக்)",
  "Top Right": "மேல் வலது",
  "Top Left": "மேல் இடது",
  "Bottom Left": "கீழ் இடது",
  "Bottom Right": "கீழ் வலது",
  "Red": "சிவப்பு",
  "White": "வெள்ளை",
  "Black": "கருப்பு",
  "Green": "பச்சை",
  "Blue": "நீலம்",
  "Yellow": "மஞ்சள்",
  "Default": "இயல்புநிலை",
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ta") {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
  };

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key: string) => (language === "ta" ? (TA[key] ?? key) : key),
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}


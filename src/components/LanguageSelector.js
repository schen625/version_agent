
const LANGUAGES = [
  { code: "auto", name: "Detect Language" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
];

const LanguageSelector = ({ translateFrom, translateTo, setTranslateFrom, setTranslateTo }) => (
  <div style={{ display: "flex", gap: "20px" }}>
    <label>
      From:{" "}
      <select value={translateFrom} onChange={e => setTranslateFrom(e.target.value)} style ={{width: "130px"}}>
        {LANGUAGES.map(lang => (
          <option key={lang.code} value={lang.code}>{lang.name}</option>
        ))}
      </select>
    </label>

    <label>
      To:{" "}
      <select value={translateTo} onChange={e => setTranslateTo(e.target.value)} style ={{width: "130px"}}>
        {LANGUAGES.filter(l => l.code !== "auto").map(lang => (
          <option key={lang.code} value={lang.code}>{lang.name}</option>
        ))}
      </select>
    </label>
  </div>
);

export default LanguageSelector;
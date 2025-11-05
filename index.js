// Spouštěcí soubor pro editorfarcik.eu bota
// (hlavní logika je v server.js)

import("./server.js")
  .then(() => console.log("✅ server.js úspěšně načten"))
  .catch(err => console.error("❌ Chyba při načítání server.js:", err));

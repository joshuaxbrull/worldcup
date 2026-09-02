const cut = new URLSearchParams(location.search).get("cut") === "phone" ? "phone" : "app";
document.body.dataset.cut = cut;

const slate = document.getElementById("slate");
const superEl = document.getElementById("super");
const endEl = document.getElementById("end");
const iframe = document.getElementById("product");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showSlate(html) {
  slate.hidden = false;
  slate.className = "slate";
  slate.innerHTML = html;
}

function hideSlate() {
  slate.className = "slate fade-out";
  return wait(520).then(() => {
    slate.hidden = true;
    slate.innerHTML = "";
  });
}

function showSuper(line, sub = "") {
  superEl.hidden = false;
  superEl.className = "super fade-in";
  superEl.innerHTML = `<span class="line">${line}</span>${sub ? `<span class="sub">${sub}</span>` : ""}`;
}

function hideSuper() {
  if (superEl.hidden) return Promise.resolve();
  superEl.className = "super fade-out";
  return wait(480).then(() => {
    superEl.hidden = true;
    superEl.innerHTML = "";
  });
}

function fitPhoneFrame() {
  if (cut !== "phone") return;
  const device = document.querySelector(".device");
  const frame = device.querySelector("iframe");
  const width = device.clientWidth;
  const scale = width / 390;
  frame.style.transform = `scale(${scale})`;
  device.style.height = `${Math.round(844 * scale)}px`;
}

function productDoc() {
  return iframe.contentDocument;
}

async function waitForProduct() {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    const doc = productDoc();
    if (doc?.querySelector(".location-card") && doc.querySelector("#map")) return doc;
    await wait(80);
  }
  throw new Error("product did not load");
}

async function setupProduct() {
  const doc = await waitForProduct();
  const win = iframe.contentWindow;
  win.open = () => null;
  const chrome = doc.createElement("style");
  chrome.textContent = `
    .leaflet-control-zoom, .leaflet-control-attribution, .settings-btn, .finder-open { display: none !important; }
  `;
  doc.head.appendChild(chrome);
  const locate = doc.getElementById("locate-btn");
  if (locate) {
    locate.click();
    const started = Date.now();
    while (Date.now() - started < 12000) {
      if (locate.textContent !== "Use my location" && !locate.disabled) break;
      await wait(80);
    }
  }
  const preferred = [...doc.querySelectorAll(".location-card")]
    .find((card) => /Katzen Eye - Bel Air/i.test(card.textContent || ""));
  (preferred || doc.querySelector(".location-card"))?.click();
  await wait(400);
}

function hideFinder() {
  const doc = productDoc();
  const app = doc?.querySelector(".app");
  const sidebar = doc?.getElementById("sidebar");
  const chip = doc?.getElementById("finder-open");
  if (!app) return;
  app.classList.add("finder-hidden");
  sidebar?.classList.add("is-minimized");
  sidebar?.classList.remove("is-expanded");
  if (sidebar) sidebar.style.height = "";
  if (chip) chip.hidden = false;
}

function flipDaylight() {
  productDoc()?.getElementById("daylight-toggle")?.click();
}

async function play() {
  fitPhoneFrame();
  window.addEventListener("resize", fitPhoneFrame);

  showSlate(`
    <p class="kicker">Harley-Davidson Eyewear</p>
    <h1>${cut === "phone" ? "THE RIDE<br>STARTS HERE." : "BUILT<br>FOR THE RIDE."}</h1>
    <p>64 shops. One map.</p>
  `);

  const ready = setupProduct().catch(() => {});
  await wait(cut === "phone" ? 2800 : 3000);
  await ready;
  fitPhoneFrame();
  await hideSlate();

  document.body.classList.add("is-live");
  await wait(800);
  showSuper("64 SHOPS.", "Maryland · Delaware · Virginia · West Virginia");
  await wait(2600);
  await hideSuper();

  await wait(500);
  if (cut === "app") {
    flipDaylight();
    await wait(1000);
  }
  hideFinder();
  await wait(700);
  showSuper(cut === "phone" ? "OPEN NOW." : "THE OPEN ROAD.", cut === "phone" ? "Before you roll up." : "Go now.");
  await wait(2800);
  await hideSuper();
  await wait(1100);

  document.body.classList.add("is-black");
  await wait(420);
  endEl.hidden = false;
  endEl.className = "end fade-in";
  await wait(2800);
  document.body.dataset.done = "1";
}

play().catch((error) => {
  console.error(error);
  document.body.dataset.done = "1";
});

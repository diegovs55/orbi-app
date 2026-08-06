#!/usr/bin/env node
/**
 * scripts/patch-package-swift.js
 *
 * Hook de Capacitor (capacitor:sync:after) que inyecta la dependencia
 * firebase-ios-sdk en ios/App/CapApp-SPM/Package.swift después de cada
 * `npx cap sync ios`.
 *
 * Capacitor CLI sobrescribe Package.swift en cada sync incluyendo solo los
 * plugins Capacitor instalados en node_modules. firebase-ios-sdk es una
 * dependencia Swift pura (no un plugin Capacitor) y por eso Capacitor la
 * elimina. Este script la restaura de forma idempotente.
 *
 * Idempotente: si firebase-ios-sdk y FirebaseMessaging ya están presentes
 * y son únicos, el archivo no se modifica.
 */

const fs = require("fs");
const path = require("path");

const PACKAGE_SWIFT = path.join(
  __dirname,
  "..",
  "ios",
  "App",
  "CapApp-SPM",
  "Package.swift"
);

const FIREBASE_DEP =
  '        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0"),';
const FIREBASE_PRODUCT =
  '                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk"),';

// Anclas donde se insertan las líneas — inmediatamente antes de CapacitorSplashScreen
const DEP_ANCHOR =
  '        .package(name: "CapacitorSplashScreen", path: "../../../node_modules/@capacitor/splash-screen")';
const PRODUCT_ANCHOR =
  '                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen")';

function patch() {
  if (!fs.existsSync(PACKAGE_SWIFT)) {
    console.log("[patch-package-swift] Package.swift no encontrado — skip.");
    return;
  }

  let content = fs.readFileSync(PACKAGE_SWIFT, "utf8");

  const hasDep = content.includes(
    '.package(url: "https://github.com/firebase/firebase-ios-sdk.git"'
  );
  const hasProduct = content.includes(
    '.product(name: "FirebaseMessaging", package: "firebase-ios-sdk")'
  );

  if (hasDep && hasProduct) {
    console.log(
      "[patch-package-swift] firebase-ios-sdk ya presente — sin cambios."
    );
    return;
  }

  let modified = false;

  if (!hasDep) {
    if (!content.includes(DEP_ANCHOR)) {
      console.error(
        "[patch-package-swift] ERROR: ancla de dependencia no encontrada. Revisa Package.swift."
      );
      process.exit(1);
    }
    content = content.replace(DEP_ANCHOR, FIREBASE_DEP + "\n" + DEP_ANCHOR);
    modified = true;
  }

  if (!hasProduct) {
    if (!content.includes(PRODUCT_ANCHOR)) {
      console.error(
        "[patch-package-swift] ERROR: ancla de producto no encontrada. Revisa Package.swift."
      );
      process.exit(1);
    }
    content = content.replace(
      PRODUCT_ANCHOR,
      FIREBASE_PRODUCT + "\n" + PRODUCT_ANCHOR
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(PACKAGE_SWIFT, content, "utf8");
    console.log(
      "[patch-package-swift] firebase-ios-sdk inyectado en Package.swift."
    );
  }
}

patch();

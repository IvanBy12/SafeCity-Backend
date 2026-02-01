import admin from "firebase-admin"

export function initFirebaseAdmin() {
  // evita reinicializar en hot-reload (nodemon)
  if (admin.apps.length) return admin
  admin.initializeApp() // usa GOOGLE_APPLICATION_CREDENTIALS del .env
  return admin
}

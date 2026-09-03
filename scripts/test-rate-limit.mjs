// Script para probar el endpoint de login y verificar Rate Limiting
const BASE_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

async function testRateLimit() {
  console.log(`[RateLimit Test] Iniciando 5 peticiones consecutivas a ${BASE_URL}/api/auth/sign-in/email ...`);

  for (let i = 1; i <= 5; i++) {
    try {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "ataque@taller.com",
          password: "password_invalida_123",
        }),
      });

      const duration = Date.now() - start;
      const status = res.status;
      let body;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }

      console.log(`Request #${i} | Status: ${status} | Tiempo: ${duration}ms | Respuesta:`, JSON.stringify(body));
    } catch (err) {
      console.error(`Request #${i} falló al conectar:`, err.message);
      console.log("Nota: Asegúrate de tener el servidor levantado con 'npm run dev'.");
      break;
    }
  }

  console.log("\n[RateLimit Test] Finalizado. Revisa en tu base de datos con: SELECT * FROM \"rateLimit\";");
}

testRateLimit();

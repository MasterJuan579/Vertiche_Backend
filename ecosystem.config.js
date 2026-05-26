/* ============================================================================
 * Archivo: ecosystem.config.js
 * Descripción: Configuración de PM2 para el backend Vertiche. Define cómo
 *              arrancar la app, carga dotenv y configura logs. Funciona igual
 *              en local (Windows) y en producción (EC2).
 * ============================================================================ */
module.exports = {
  apps: [
    {
      name: "vertiche-api",
      script: "dist/index.js",
      // Carga las variables de entorno desde .env al arrancar
      node_args: "-r dotenv/config",
      // Reiniciar si crashea
      autorestart: true,
      // Esperar 3s antes de reiniciar para evitar bucles
      restart_delay: 3000,
      // Archivos de log
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      // Formato de fecha en los logs
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "development"
      }
    }
  ]
};
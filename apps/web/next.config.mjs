/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@newdisc/shared"],
  // Exportação estática opcional para empacotar no Tauri:
  // output: "export",
};

export default nextConfig;

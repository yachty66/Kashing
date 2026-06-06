/** @type {import('next').NextConfig} */
const nextConfig = {
  // twilio uses dynamic requires that the bundler can't statically analyze;
  // keep it external so it's required at runtime in the Node server.
  serverExternalPackages: ["twilio"],
};
export default nextConfig;

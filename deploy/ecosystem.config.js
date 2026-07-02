/**
 * PM2 process file — runs both apps on the EC2 box.
 * Frontend: Next.js production server on :3000.
 * Backend:  compiled Express API on :4000.
 */
module.exports = {
  apps: [
    {
      name: 'elate-frontend',
      cwd: '/home/ubuntu/elatetrips',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '600M',
    },
    {
      name: 'elate-backend',
      cwd: '/home/ubuntu/elatetrips/elatetrips-node',
      script: 'dist/server.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
  ],
};

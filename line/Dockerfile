# Production image ของบอท LINE — ใช้แค่ของในตัว Node ไม่ต้อง npm install
# (Playwright / cloudflared ใช้เฉพาะตอนพัฒนา: npm run render / npm run bot)
# ไม่มี tunnel: nginx หน้าเว็บส่ง https://<โดเมน>/line/* มาที่ service นี้ (ดู docs/deployment.md)
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json env.js flex.js bot.js setup-richmenu.js check.js menu-gps.jpg menu-shop.jpg ./
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.BOT_PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "bot.js", "--no-tunnel"]

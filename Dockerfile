FROM node:20-alpine

# System deps for sharp + pdf-parse
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

COPY backend/package.json ./
RUN npm install --production

COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create data + uploads dirs
RUN mkdir -p /data /uploads

ENV PORT=3000
ENV DB_PATH=/data/recept.db
ENV UPLOADS_PATH=/uploads
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "backend/server.js"]

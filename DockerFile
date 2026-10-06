FROM node:18-slim

RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl && \
    apt-get clean

# Install yt-dlp with Railway workaround
RUN if [ ! -z "$RAILWAY_STATIC_URL" ]; then \
      pip3 install --no-cache-dir yt-dlp; \
    fi

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "start"]

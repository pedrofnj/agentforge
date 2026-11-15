FROM base-image:latest
ARG DB_PASSWORD
COPY . /app
RUN /app/setup.sh
CMD ["/app/start"]

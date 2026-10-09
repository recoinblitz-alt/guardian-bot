const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

class DeepgramManager {
  constructor() {
    this.accounts = [];

    // ---------------------------------------------------------
    // LOAD 10 DEEPGRAM ACCOUNTS
    // ---------------------------------------------------------
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`DEEPGRAM_KEY_${i}`];

      if (key && key.trim()) {
        this.accounts.push({
          id: i,
          key: key.trim()
        });
      }
    }

    if (this.accounts.length === 0) {
      console.error("❌ No Deepgram API keys found.");
      console.error(
        "Add DEEPGRAM_KEY_1 ... DEEPGRAM_KEY_10 to your .env"
      );
      process.exit(1);
    }

    console.log(
      `🔑 Loaded ${this.accounts.length} Deepgram account(s)`
    );

    // ---------------------------------------------------------
    // SETTINGS
    // ---------------------------------------------------------
    this.model =
      process.env.DEEPGRAM_MODEL || "nova-3";

    this.dailyLimitMinutes =
      Number(process.env.DEEPGRAM_DAILY_MINUTES) || 6000;

    this.dailyLimitBytes =
      this.dailyLimitMinutes *
      60 *
      16000 *
      2; // 16 kHz mono 16-bit

    this.usageFile = path.join(
      __dirname,
      "deepgram-usage.json"
    );

    this.usage = this.loadUsage();

    // ---------------------------------------------------------
    // RECOGNITION HINTS
    // ---------------------------------------------------------
    // Slang words are NEVER sent as hints: hinting slang makes
    // Deepgram "hear" slang in normal speech (VC -> BC).
    // Only safe server words (VC, server name, nicknames) from
    // the panel are sent, so those are heard correctly.
    // ---------------------------------------------------------
    this.keyterms = ["VC"];

    this.resetIfNewDay();
  }

  // =========================================================
  // DATE
  // =========================================================

  getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  resetIfNewDay() {
    const today = this.getToday();

    if (this.usage.date !== today) {
      this.usage = {
        date: today,
        accounts: {}
      };

      this.saveUsage();

      console.log(
        `🔄 Deepgram daily usage reset: ${today}`
      );
    }
  }

  // =========================================================
  // USAGE FILE
  // =========================================================

  loadUsage() {
    try {
      if (!fs.existsSync(this.usageFile)) {
        return {
          date: this.getToday(),
          accounts: {}
        };
      }

      const data = JSON.parse(
        fs.readFileSync(this.usageFile, "utf8")
      );

      if (!data || typeof data !== "object") {
        throw new Error("Invalid usage file");
      }

      return data;
    } catch (error) {
      console.warn(
        "⚠️ Could not load Deepgram usage file:",
        error.message
      );

      return {
        date: this.getToday(),
        accounts: {}
      };
    }
  }

  saveUsage() {
    try {
      fs.writeFileSync(
        this.usageFile,
        JSON.stringify(this.usage, null, 2),
        "utf8"
      );
    } catch (error) {
      console.error(
        "❌ Could not save Deepgram usage:",
        error.message
      );
    }
  }

  // =========================================================
  // ACCOUNT USAGE
  // =========================================================

  getAccountUsage(accountId) {
    this.resetIfNewDay();

    if (!this.usage.accounts[accountId]) {
      this.usage.accounts[accountId] = {
        bytes: 0,
        exhausted: false,
        exhaustedReason: null
      };
    }

    return this.usage.accounts[accountId];
  }

  getUsageMinutes(accountId) {
    const usage =
      this.getAccountUsage(accountId);

    const bytesPerMinute =
      16000 * 2 * 60;

    return usage.bytes / bytesPerMinute;
  }

  // =========================================================
  // AVAILABLE ACCOUNT
  // =========================================================

  getAvailableAccount() {
    this.resetIfNewDay();

    for (const account of this.accounts) {
      const usage =
        this.getAccountUsage(account.id);

      if (usage.exhausted) {
        continue;
      }

      if (
        usage.bytes >=
        this.dailyLimitBytes
      ) {
        usage.exhausted = true;
        usage.exhaustedReason =
          "daily limit reached";

        this.saveUsage();

        console.warn(
          `⚠️ Deepgram Account ${account.id} reached daily limit`
        );

        continue;
      }

      return account;
    }

    console.error(
      "❌ ALL DEEPGRAM ACCOUNTS ARE EXHAUSTED"
    );

    return null;
  }

  // =========================================================
  // MARK ACCOUNT EXHAUSTED
  // =========================================================

  markExhausted(
    accountId,
    reason = "unknown"
  ) {
    const usage =
      this.getAccountUsage(accountId);

    usage.exhausted = true;
    usage.exhaustedReason = reason;

    this.saveUsage();

    console.warn(
      `🚫 Deepgram Account ${accountId} marked exhausted: ${reason}`
    );
  }

  // =========================================================
  // ADD USAGE
  // =========================================================

  addUsage(accountId, bytes) {
    if (!bytes || bytes <= 0) {
      return;
    }

    const usage =
      this.getAccountUsage(accountId);

    usage.bytes += bytes;

    if (
      usage.bytes >=
      this.dailyLimitBytes
    ) {
      usage.exhausted = true;
      usage.exhaustedReason =
        "daily limit reached";
    }

    this.saveUsage();
  }

  // =========================================================
  // ACCOUNT INFORMATION
  // =========================================================

  getAccountInfo() {
    this.resetIfNewDay();

    return this.accounts.map(account => {
      const usage =
        this.getAccountUsage(account.id);

      return {
        id: account.id,

        usedBytes:
          usage.bytes,

        usedMinutes:
          this.getUsageMinutes(account.id),

        limitMinutes:
          this.dailyLimitMinutes,

        exhausted:
          usage.exhausted,

        reason:
          usage.exhaustedReason
      };
    });
  }

  // =========================================================
  // CREATE DEEPGRAM STREAM
  // =========================================================

  createStream({
    account,
    keyterms = [],
    onTranscript,
    onError,
    onClose
  }) {
    if (!account || !account.key) {
      throw new Error(
        "Invalid Deepgram account"
      );
    }

    // -------------------------------------------------------
    // ONLY USE A SMALL NUMBER OF KEYTERMS
    // -------------------------------------------------------

    const combinedKeyterms = [
      ...this.keyterms,
      ...(Array.isArray(keyterms)
        ? keyterms
        : [])
    ];

    // Remove duplicates
    const uniqueKeyterms = [
      ...new Set(
        combinedKeyterms
          .filter(Boolean)
          .map(x =>
            String(x).trim()
          )
          .filter(Boolean)
      )
    ];

    // Safety limit
    const finalKeyterms =
      uniqueKeyterms.slice(0, 30);

    // -------------------------------------------------------
    // DEEPGRAM QUERY
    // -------------------------------------------------------

    const params =
      new URLSearchParams();

    params.set(
      "model",
      this.model
    );

    params.set(
      "language",
      process.env.DEEPGRAM_LANGUAGE || "multi"
    );

    params.set(
      "encoding",
      "linear16"
    );

    params.set(
      "sample_rate",
      "16000"
    );

    params.set(
      "channels",
      "1"
    );

    params.set(
      "interim_results",
      "false"
    );

    params.set(
      "endpointing",
      "700"
    );

    params.set(
      "punctuate",
      "true"
    );

    params.set(
      "smart_format",
      "true"
    );

    params.set(
      "mip_opt_out",
      "true"
    );

    // -------------------------------------------------------
    // KEYTERMS
    // -------------------------------------------------------

    for (
      const term of finalKeyterms
    ) {
      params.append(
        "keyterm",
        term
      );
    }

    const url =
      `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    console.log(
      `🌐 Opening Deepgram Account ${account.id}`
    );

    // -------------------------------------------------------
    // WEBSOCKET
    // -------------------------------------------------------

    let ws;

    try {
      ws = new WebSocket(
        url,
        {
          headers: {
            Authorization:
              `Token ${account.key}`
          }
        }
      );
    } catch (error) {
      console.error(
        `❌ Deepgram WebSocket creation failed for Account ${account.id}:`,
        error.message
      );

      if (onError) {
        onError(error);
      }

      return null;
    }

    let closed = false;
    let closing = false;
    let closeTimer = null;
    let totalBytesSent = 0;
    const pending = []; // audio captured before the socket opened

    // -------------------------------------------------------
    // OPEN
    // -------------------------------------------------------

    ws.on("open", () => {
      console.log(
        `✅ Deepgram Account ${account.id} connected`
      );
      while (pending.length) {
        const b = pending.shift();
        try { ws.send(b); totalBytesSent += b.length; } catch (_) {}
      }
      if (closing) requestFinalize();
    });

    // -------------------------------------------------------
    // MESSAGE
    // -------------------------------------------------------

    ws.on(
      "message",
      data => {
        try {
          const message =
            JSON.parse(
              data.toString()
            );

          // -------------------------------------------------
          // TRANSCRIPT
          // -------------------------------------------------

          if (
            message.type ===
              "Results"
          ) {
            const alternative =
              message.channel
                ?.alternatives?.[0];

            const transcript =
              alternative?.transcript
                ?.trim();

            if (
              typeof onTranscript ===
                "function"
            ) {
              onTranscript({
                transcript: transcript || "",
                isFinal: Boolean(message.is_final),
                speechFinal: Boolean(message.speech_final),
                confidence: Number(alternative?.confidence ?? 0),
                // per-word confidence lets the bot ignore words Deepgram wasn't sure about
                words: (alternative?.words || []).map((w) => ({
                  word: w.punctuated_word || w.word || "",
                  confidence: Number(w.confidence ?? 0),
                  start: Number(w.start ?? 0),
                  end: Number(w.end ?? 0),
                })),
                raw: message
              });
            }

            if (closing && message.from_finalize) requestClose();

            return;
          }

          // -------------------------------------------------
          // ERROR MESSAGE
          // -------------------------------------------------

          if (
            message.type ===
              "Error"
          ) {
            const errorMessage =
              message.description ||
              message.message ||
              "Deepgram error";

            console.error(
              `⚠️ Deepgram Account ${account.id}: ${errorMessage}`
            );

            if (
              typeof onError ===
              "function"
            ) {
              onError(
                new Error(
                  errorMessage
                )
              );
            }

            return;
          }

          // -------------------------------------------------
          // METADATA
          // -------------------------------------------------

          if (
            message.type ===
            "Metadata"
          ) {
            return;
          }

          // -------------------------------------------------
          // KEEPALIVE
          // -------------------------------------------------

          if (
            message.type ===
            "KeepAlive"
          ) {
            return;
          }
        } catch (error) {
          console.warn(
            `⚠️ Could not parse Deepgram message:`,
            error.message
          );
        }
      }
    );

    // -------------------------------------------------------
    // WEBSOCKET ERROR
    // -------------------------------------------------------

    ws.on(
      "error",
      error => {
        console.error(
          `⚠️ Deepgram WebSocket error for Account ${account.id}:`,
          error.message
        );

        if (
          typeof onError ===
          "function"
        ) {
          onError(error);
        }
      }
    );

    // -------------------------------------------------------
    // WEBSOCKET CLOSE
    // -------------------------------------------------------

    ws.on(
      "close",
      (code, reason) => {
        closed = true;
        clearTimeout(closeTimer);

        console.log(
          `🔌 Deepgram Account ${account.id} closed. Code: ${code}`
        );

        if (
          reason &&
          reason.length
        ) {
          console.log(
            `🔌 Close reason: ${reason.toString()}`
          );
        }

        if (
          typeof onClose ===
          "function"
        ) {
          onClose(
            code,
            reason
          );
        }
      }
    );

    // -------------------------------------------------------
    // SEND PCM AUDIO
    // -------------------------------------------------------

    const send = buffer => {
      if (!buffer || !buffer.length) {
        return false;
      }

      if (closed || closing) return false;
      if (ws.readyState === WebSocket.CONNECTING) {
        if (pending.length < 200) pending.push(buffer);
        return true;
      }
      if (ws.readyState !== WebSocket.OPEN) {
        return false;
      }

      try {
        ws.send(buffer);

        totalBytesSent +=
          buffer.length;

        // usage is tracked once by the caller (index.js)

        return true;
      } catch (error) {
        console.error(
          `❌ Failed sending audio to Deepgram Account ${account.id}:`,
          error.message
        );

        return false;
      }
    };

    // -------------------------------------------------------
    // CLOSE STREAM
    // -------------------------------------------------------

    // Control messages finalize existing audio without uploading silent PCM.
    const requestClose = () => {
      if (closed) return;
      clearTimeout(closeTimer);
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch (error) { onError?.(error); }
      // Allow the server's remaining Results/Metadata to arrive before forcing exit.
      closeTimer = setTimeout(() => ws.terminate(), 2000);
    };
    const requestFinalize = () => {
      clearTimeout(closeTimer);
      try { ws.send(JSON.stringify({ type: "Finalize" })); }
      catch (error) { onError?.(error); }
      closeTimer = setTimeout(requestClose, 5000);
    };
    const close = () => {
      if (closed || closing) return;
      closing = true;
      if (ws.readyState === WebSocket.OPEN) requestFinalize();
      else if (ws.readyState === WebSocket.CONNECTING) {
        // Do not discard short utterances captured during the opening handshake.
        closeTimer = setTimeout(() => ws.terminate(), 10000);
      } else ws.terminate();
    };

    // -------------------------------------------------------
    // RETURN STREAM OBJECT
    // -------------------------------------------------------

    return {
      ws,
      send,
      close,

      get totalBytesSent() {
        return totalBytesSent;
      },

      accountId:
        account.id
    };
  }
}

// ===========================================================
// EXPORTS
// ===========================================================

module.exports =
  DeepgramManager;

module.exports.DeepgramManager =
  DeepgramManager;
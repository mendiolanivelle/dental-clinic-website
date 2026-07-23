const otpMessage = (code, expiryMinutes) =>
  `Your dental portal verification code is ${code}. It expires in ${expiryMinutes} minutes.`

export function createSmsSender(config, { fetchFn = fetch } = {}) {
  if (config.nodeEnv === 'production' && config.smsProvider === 'development') {
    throw new Error('Development SMS delivery is forbidden in production')
  }

  if (config.smsProvider === 'development') {
    return {
      // Codes are intentionally discarded instead of written to application logs.
      async sendOtp() {},
    }
  }

  return {
    async sendOtp(phone, code) {
      const response = await fetchFn(config.smsApiUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.smsApiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          to: phone,
          from: config.smsSender,
          message: otpMessage(code, config.otpExpiryMinutes),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('SMS delivery failed')
    },
  }
}

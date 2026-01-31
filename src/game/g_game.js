let clientVersion = 860

export function setGameClientVersion(version) {
  const parsed = parseInt(version, 10)
  clientVersion = Number.isFinite(parsed) && parsed > 0 ? parsed : 860
  return clientVersion
}

export function getGameClientVersion() {
  return clientVersion
}


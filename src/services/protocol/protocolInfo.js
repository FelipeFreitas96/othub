import { FEATURES, isFeatureEnabled, setClientVersion } from './features'

export const OTSERV_RSA =
    '1091201329673994292788609605089955415282375029027981291234687579' +
    '3726629149257644633073969600111060390723088861007265581882535850' +
    '3429057592827629436413108566029093628212635953836686562675849720' +
    '6207862794310902180176810615217550567108238764764442605581471797' +
    '07119674283982419152118103759076030616683978566631413'

export const PIC_SIGNATURE = 0x56c5dde7

const PROTOCOL_VERSION_MAP = {
    980: 971,
    981: 973,
    982: 974,
    983: 975,
    984: 976,
    985: 977,
    986: 978,
    1001: 979,
    1002: 980,
}

export function getProtocolInfo(clientVersion) {
    const version = setClientVersion(clientVersion)
    const protocolVersion = PROTOCOL_VERSION_MAP[version] || version

    return {
        clientVersion: version,
        protocolVersion,
        accountNames: isFeatureEnabled(FEATURES.GameAccountNames),
        loginEncryption: isFeatureEnabled(FEATURES.GameLoginPacketEncryption),
        checksum: isFeatureEnabled(FEATURES.GameProtocolChecksum),
        previewState: isFeatureEnabled(FEATURES.GamePreviewState),
        clientVersionFeature: isFeatureEnabled(FEATURES.GameClientVersion),
        contentRevision: isFeatureEnabled(FEATURES.GameContentRevision),
        authenticator: isFeatureEnabled(FEATURES.GameAuthenticator),
        sessionKey: isFeatureEnabled(FEATURES.GameSessionKey),
        challengeOnLogin: isFeatureEnabled(FEATURES.GameChallengeOnLogin),
        messageSizeCheck: isFeatureEnabled(FEATURES.GameMessageSizeCheck),
        sequencedPackets: isFeatureEnabled(FEATURES.GameSequencedPackets),
    }
}

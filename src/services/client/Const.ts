export enum SkillEnum {
    SKILL_FIST = 0,
    SKILL_CLUB = 1,
    SKILL_SWORD = 2,
    SKILL_AXE = 3,
    SKILL_DISTANCE = 4,
    SKILL_SHIELDING = 5,
    SKILL_FISHING = 6,
}

export enum GameEventsEnum {
    processLogin = 'processLogin',
    onGameStart = 'onGameStart',
    onConnectionError = 'onConnectionError',
}

export enum MagicEffectsTypeEnum {
    MAGIC_EFFECTS_END_LOOP = 0, // ends the magic effect loop
    MAGIC_EFFECTS_DELTA = 1, // needs uint8_t delta after type to adjust position
    MAGIC_EFFECTS_DELAY = 2, // needs uint16_t delay after type to delay in miliseconds effect display
    MAGIC_EFFECTS_CREATE_EFFECT = 3, // needs uint8_t effectid after type
    MAGIC_EFFECTS_CREATE_DISTANCEEFFECT = 4, // needs uint8_t and deltaX(int8_t), deltaY(int8_t) after type
    MAGIC_EFFECTS_CREATE_DISTANCEEFFECT_REVERSED = 5, // needs uint8_t and deltaX(int8_t), deltaY(int8_t) after type
    MAGIC_EFFECTS_CREATE_SOUND_MAIN_EFFECT = 6, // needs uint16_t after type
    MAGIC_EFFECTS_CREATE_SOUND_SECONDARY_EFFECT = 7, // needs uint8_t and uint16_t after type
}

export enum MessageModeEnum {
    MessageNone = 0,
    MessageSay = 1,
    MessageWhisper = 2,
    MessageYell = 3,
    MessagePrivateFrom = 4,
    MessagePrivateTo = 5,
    MessageChannelManagement = 6,
    MessageChannel = 7,
    MessageChannelHighlight = 8,
    MessageSpell = 9,
    MessageNpcFrom = 10,
    MessageNpcTo = 11,
    MessageGamemasterBroadcast = 12,
    MessageGamemasterChannel = 13,
    MessageGamemasterPrivateFrom = 14,
    MessageGamemasterPrivateTo = 15,
    MessageBarkLow = 34,
    MessageBarkLoud = 35,
    MessageMonsterSay = 44,
    MessageMonsterYell = 43,
    MessageRVRChannel = 47,
    MessageRVRAnswer = 48,
    MessageRVRContinue = 49,
    MessageNpcFromStartBlock = 51,
    MessagePotion = 52,
    MessageWarning = 17,
    MessageGame = 18,
    MessageLogin = 16,
    MessageStatus = 28,
    MessageLook = 20,
    MessageFailure = 19,
    MessageRed = 45,
    MessageBlue = 46,
    MessageGuild = 53,
    MessagePartyManagement = 54,
    MessageParty = 55,
    MessageDamageDealed = 56,
    MessageDamageReceived = 57,
    MessageDamageOthers = 58,
    MessageHeal = 59,
    MessageMana = 60,
    MessageHealOthers = 61,
    MessageExp = 62,
    MessageExpOthers = 63,
    MessageInvalid = 255,
}

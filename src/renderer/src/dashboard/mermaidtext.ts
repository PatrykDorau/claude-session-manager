const LIST_START = /([[("|]\s*)(\d+\.|[-*+])[ \t]+/g

export const escapeListLabels = (source: string): string => source.replace(LIST_START, '$1$2 ')

// Central view of what is configured vs still on placeholders.
// The /admin page renders this as the go-live checklist.

export interface IntegrationStatus {
  key: string;
  label: string;
  configured: boolean;
  required: boolean;
  note: string;
}

function realValue(v: string | undefined): boolean {
  return !!v && v.trim() !== '' && !v.includes('PLACEHOLDER');
}

export function anthropicConfigured(): boolean {
  return realValue(process.env.ANTHROPIC_API_KEY);
}

export function chatModel(): string {
  const v = process.env.RB_CHAT_MODEL;
  return realValue(v) ? (v as string) : 'claude-sonnet-5-5';
}

export function integrationStatuses(): IntegrationStatus[] {
  return [
    {
      key: 'ANTHROPIC_API_KEY',
      label: 'Claude API key',
      configured: anthropicConfigured(),
      required: true,
      note: 'Powers AI answers in Chat. Until set, Chat runs in knowledge-search mode.',
    },
    {
      key: 'RB_SESSION_SECRET',
      label: 'Session signing secret',
      configured: realValue(process.env.RB_SESSION_SECRET),
      required: true,
      note: 'Signs login cookies. Required: the app fails closed until this is a real value.',
    },
    {
      key: 'RB_TEAM_PASSCODE',
      label: 'Team passcode',
      configured: realValue(process.env.RB_TEAM_PASSCODE),
      required: true,
      note: 'Required: no built-in default. The app fails closed until this is set.',
    },
    {
      key: 'RB_LEADERSHIP_PASSCODE',
      label: 'Leadership passcode',
      configured: realValue(process.env.RB_LEADERSHIP_PASSCODE),
      required: true,
      note: 'Required: no built-in default. The app fails closed until this is set.',
    },
    {
      key: 'RB_CEO_PASSCODE',
      label: 'CEO passcode',
      configured: realValue(process.env.RB_CEO_PASSCODE),
      required: true,
      note: 'Required: no built-in default. The app fails closed until this is set.',
    },
    {
      key: 'ENTRA_CLIENT_ID',
      label: 'Microsoft Entra ID SSO',
      configured: realValue(process.env.ENTRA_CLIENT_ID),
      required: false,
      note: 'Optional later upgrade: replace passcodes with Microsoft 365 sign-in.',
    },
  ];
}

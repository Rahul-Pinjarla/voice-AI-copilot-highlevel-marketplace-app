interface SlackField {
  type: "mrkdwn" | "plain_text";
  text: string;
}

interface SlackBlock {
  type: string;
  text?: SlackField;
  fields?: SlackField[];
  elements?: Array<{ type: string; text?: SlackField }>;
}

function buildAlertPayload(agentName: string, passRate: number, callWindow: number): object {
  const pct = Math.round(passRate * 100);
  const emoji = pct < 50 ? "🔴" : "🟠";

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} Agent Performance Alert` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Agent*\n${agentName}` },
        { type: "mrkdwn", text: `*Pass Rate*\n${pct}% (last ${callWindow} calls)` },
        { type: "mrkdwn", text: "*Threshold*\n70%" },
        { type: "mrkdwn", text: `*Status*\n${emoji} Below threshold` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `The agent's pass rate has dropped to *${pct}%* over the last ${callWindow} calls — below the 70% threshold. Review recent call analyses and consider updating the agent's prompt or configuration.`,
      },
    },
    { type: "divider" },
  ];

  return { blocks };
}

export async function sendPassRateAlert(
  webhookUrl: string,
  agentName: string,
  passRate: number,
  callWindow: number,
): Promise<void> {
  const payload = buildAlertPayload(agentName, passRate, callWindow);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook responded with ${res.status}: ${await res.text()}`);
  }
}

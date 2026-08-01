import { Modal, Pressable, ScrollView, Text, View } from "react-native";

const SAMPLE_USERNAME = "username";

// Splits on {link}/{username} tokens like the web's campaign-preview.tsx
// renderMessage(), but returns plain strings since RN Text needs an array of
// children rather than dangerouslySetInnerHTML-style spans.
function renderTokens(text, hasLink) {
  if (!text) return null;
  const withName = text.replace(/\{username\}/g, SAMPLE_USERNAME);
  const parts = withName.split(/(\{link\})/g);
  return parts.map((part, i) => {
    if (part === "{link}") {
      return (
        <Text key={i} className={hasLink ? "text-accent underline" : "italic text-muted"}>
          {hasLink ? "yourlink.com/offer" : "{link}"}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

function Bubble({ label, message, buttonLabel, hasLink = false }) {
  if (!message?.trim()) return null;
  return (
    <View className="items-end gap-1">
      <Text className="pr-1 text-[11px] uppercase tracking-wide text-muted">{label}</Text>
      <View className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5">
        <Text className="text-sm leading-5 text-background">
          {renderTokens(message, hasLink)}
        </Text>
      </View>
      {buttonLabel ? (
        <View className="max-w-[85%] rounded-full border border-accent px-4 py-1.5">
          <Text className="text-xs font-semibold text-accent">{buttonLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Bottom-sheet preview of how a campaign's DMs/public reply will read.
 * Plain RN Modal sliding up from the bottom (no @gorhom/bottom-sheet dep,
 * per the task's constraint) — a rounded top + drag-handle bar approximates
 * a sheet without a new native dependency. No phone-frame chrome: this is
 * a mobile app, so the device itself is already the frame (see
 * components/campaign-preview.tsx for the web's phone-mockup equivalent).
 *
 * `draft` accepts either the wizard's Zustand draft shape or the edit
 * screen's local form state — both use the same field names as
 * createAutomationSchema.
 */
export default function CampaignPreviewSheet({ visible, onClose, draft }) {
  const hasLink = Boolean(draft.trackedDestinationUrl?.trim());
  const hasSecondLink =
    Boolean(draft.secondaryDestinationUrl?.trim()) && Boolean(draft.trackedDestinationUrl?.trim());
  const firstPublicReply = (draft.publicReplyMessages ?? []).find((m) => m?.trim());
  const extraVariants = (draft.publicReplyMessages ?? []).filter((m) => m?.trim()).length - 1;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View
        className="max-h-[80%] rounded-t-2xl border border-border bg-background"
        style={{ shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12 }}
      >
        <View className="items-center py-2.5">
          <View className="h-1 w-10 rounded-full bg-border-hover" />
        </View>
        <View className="flex-row items-center justify-between px-4 pb-3">
          <Text className="text-base font-semibold text-foreground">Preview</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text className="text-sm font-medium text-accent">Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14 }}>
          {draft.requireFollow ? (
            <Bubble
              label="Follow prompt"
              message={draft.followPromptMessage}
              buttonLabel={draft.followPromptButtonLabel || "i'm following"}
            />
          ) : null}

          {draft.openingDmEnabled ? (
            <Bubble
              label="Opening DM"
              message={draft.openingDmMessage}
              buttonLabel={draft.openingDmButtonLabel}
            />
          ) : null}

          <Bubble
            label="Reveal DM"
            message={draft.dmMessage}
            hasLink={hasLink}
            buttonLabel={hasLink ? draft.linkButtonLabel || "Open link" : null}
          />
          {hasSecondLink ? (
            <View className="items-end">
              <View className="max-w-[85%] rounded-full border border-accent px-4 py-1.5">
                <Text className="text-xs font-semibold text-accent">
                  {draft.secondaryButtonLabel || "Open link"}
                </Text>
              </View>
            </View>
          ) : null}

          {draft.followUpEnabled ? (
            <Bubble label="Follow-up" message={draft.followUpMessage} />
          ) : null}

          {draft.publicReplyEnabled && firstPublicReply ? (
            <View className="gap-1.5 border-t border-border pt-3">
              <Text className="text-[11px] uppercase tracking-wide text-muted">
                Public reply (under their comment)
              </Text>
              <View className="self-start rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-2.5">
                <Text className="text-sm leading-5 text-foreground">{firstPublicReply}</Text>
              </View>
              {extraVariants > 0 ? (
                <Text className="text-xs text-muted">
                  +{extraVariants} more variant{extraVariants > 1 ? "s" : ""}, one picked at random
                </Text>
              ) : null}
            </View>
          ) : null}

          {!draft.dmMessage?.trim() &&
          !draft.openingDmEnabled &&
          !draft.requireFollow &&
          !draft.followUpEnabled &&
          !(draft.publicReplyEnabled && firstPublicReply) ? (
            <Text className="py-8 text-center text-sm text-muted">
              Nothing to preview yet — add a message first.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

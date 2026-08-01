import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

/**
 * Chip input for campaign keywords. Type a word then comma/return to add it
 * as a chip; tap a chip to remove it. Mirrors the web's comma-separated text
 * field (components/campaign-builder.tsx) but as discrete, removable chips —
 * a better fit for touch than editing a single text blob.
 */
export default function KeywordChipInput({ keywords, onChange, max = 10 }) {
  const [text, setText] = useState("");

  function commit(raw) {
    // Mirrors the server's z.string().min(1).max(50) per-keyword limit
    // (app/api/automations/route.ts) — without this, a long keyword could
    // pass every client-side wizard step and only fail at final submit.
    const word = raw.trim().slice(0, 50);
    if (!word || keywords.includes(word) || keywords.length >= max) {
      setText("");
      return;
    }
    onChange([...keywords, word]);
    setText("");
  }

  function handleChangeText(value) {
    if (/[,\n]$/.test(value)) {
      commit(value.slice(0, -1));
      return;
    }
    setText(value);
  }

  function removeAt(index) {
    onChange(keywords.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-2">
      {keywords.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {keywords.map((word, i) => (
            <Pressable
              key={`${word}-${i}`}
              onPress={() => removeAt(i)}
              className="flex-row items-center gap-1.5 rounded-full border border-accent bg-accent/10 px-3 py-1.5"
            >
              <Text className="text-xs font-medium text-accent">{word}</Text>
              <Text className="text-xs font-bold text-accent">×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {keywords.length < max ? (
        <TextInput
          value={text}
          onChangeText={handleChangeText}
          onSubmitEditing={() => commit(text)}
          placeholder="Type a word, then comma or return"
          placeholderTextColor="#9b9ba3"
          maxLength={50}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
        />
      ) : (
        <Text className="text-xs text-muted">Maximum {max} keywords.</Text>
      )}
    </View>
  );
}

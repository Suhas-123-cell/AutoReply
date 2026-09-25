import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";

export default function BillingReturnScreen() {
  const navigation = useNavigation();
  const { status } = useRoute().params ?? {};
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["billing-status"] });
  }, [queryClient]);

  const message = status === "success"
    ? "Payment was completed. Your plan will update as soon as the billing webhook arrives."
    : status === "canceled"
      ? "Checkout was canceled. No plan change was made."
      : "Billing settings were closed.";

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="text-center text-xl font-bold text-foreground">Back in AutoReply</Text>
      <Text className="text-center text-sm text-muted">{message}</Text>
      <Pressable
        onPress={() =>
          navigation.navigate("AppTabs", {
            screen: "MoreStack",
            params: { screen: "Usage" },
          })
        }
        className="rounded-lg bg-accent px-5 py-3"
      >
        <Text className="font-semibold text-background">View usage and plan</Text>
      </Pressable>
    </View>
  );
}

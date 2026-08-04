import { createNativeStackNavigator } from "@react-navigation/native-stack";
import InboxListScreen from "../../app/(app)/inbox/index";
import ThreadScreen from "../../app/(app)/inbox/[conversationId]";

const Stack = createNativeStackNavigator();

// Both screens build their own header row, so the native stack header stays
// hidden here (mirrors the old inbox/_layout.jsx).
export default function InboxStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InboxList" component={InboxListScreen} />
      <Stack.Screen name="Conversation" component={ThreadScreen} />
    </Stack.Navigator>
  );
}

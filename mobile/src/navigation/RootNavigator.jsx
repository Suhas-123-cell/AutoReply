import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import AppTabs from "./AppTabs";
import AuthStack from "./AuthStack";
import IgConnectScreen from "../../app/ig-connect";
import InviteAcceptScreen from "../../app/invite/[token]";
import BillingReturnScreen from "../../app/billing";
import VerifyPhoneScreen from "../../app/(auth)/verify-phone";

const Stack = createNativeStackNavigator();

/**
 * Conditionally rendering the "AppTabs" vs "AuthStack" screen (rather than
 * mounting one navigator and firing a redirect effect once auth state
 * resolves) is React Navigation's documented auth-flow pattern: the
 * navigator's mounted route reacts to phone authorization directly, so there is no
 * frame where a stale route briefly renders before a redirect fires. That
 * also fixes a pre-existing bug from the expo-router version, where a
 * signed-out user could briefly flash the ig-connect screen before the old
 * redirect effect kicked in.
 *
 * IgConnect is registered here unconditionally (a sibling of the
 * AppTabs/AuthStack screen, not nested inside either) because it's the
 * autoreply://ig-connect OAuth-callback deep-link landing screen and must
 * stay reachable regardless of sign-in state.
 */
export default function RootNavigator() {
  const { isSignedIn, isAuthorized, isSwitching, isOffline, workspace, refreshSession } = useAuth();
  const navigationKey = isAuthorized ? `workspace:${workspace.id}` : isSignedIn ? "phone-required" : "signed-out";
  if (isSwitching) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator /></View>;

  return (
    <View className="flex-1">
    {isOffline ? (
      <Pressable onPress={() => refreshSession().catch(() => {})} className="bg-surface px-4 py-2">
        <Text className="text-center text-warning">
          {isAuthorized ? "Offline — showing saved totals. Tap to reconnect." : "Offline — tap to reconnect before verifying your phone."}
        </Text>
      </Pressable>
    ) : null}
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthorized ? (
        <Stack.Screen name="AppTabs" navigationKey={workspace?.id} component={AppTabs} />
      ) : isSignedIn ? (
        <Stack.Screen name="VerifyPhone" component={VerifyPhoneScreen} />
      ) : (
        <Stack.Screen name="AuthStack" component={AuthStack} />
      )}
      <Stack.Group navigationKey={navigationKey}>
      <Stack.Screen name="IgConnect" component={IgConnectScreen} options={{ presentation: "modal" }} />
      <Stack.Screen name="BillingReturn" component={BillingReturnScreen} />
      <Stack.Screen
        name="InviteAccept"
        component={InviteAcceptScreen}
        options={{ presentation: "modal" }}
      />
      </Stack.Group>
    </Stack.Navigator>
    </View>
  );
}

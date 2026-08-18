import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import AppTabs from "./AppTabs";
import AuthStack from "./AuthStack";
import IgConnectScreen from "../../app/ig-connect";
import InviteAcceptScreen from "../../app/invite/[token]";

const Stack = createNativeStackNavigator();

/**
 * Conditionally rendering the "AppTabs" vs "AuthStack" screen (rather than
 * mounting one navigator and firing a redirect effect once auth state
 * resolves) is React Navigation's documented auth-flow pattern: the
 * navigator's mounted route reacts to isSignedIn directly, so there is no
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
  const { isSignedIn } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isSignedIn ? (
        <Stack.Screen name="AppTabs" component={AppTabs} />
      ) : (
        <Stack.Screen name="AuthStack" component={AuthStack} />
      )}
      <Stack.Screen name="IgConnect" component={IgConnectScreen} options={{ presentation: "modal" }} />
      <Stack.Screen
        name="InviteAccept"
        component={InviteAcceptScreen}
        options={{ presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}

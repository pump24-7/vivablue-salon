import {Stack} from 'expo-router';
import {SessionProvider} from '../src/session';
import {theme} from '../src/theme';
export default function RootLayout(){
 return <SessionProvider><Stack screenOptions={{headerStyle:{backgroundColor:theme.paper},headerTintColor:theme.ink,
 headerTitleStyle:{fontWeight:'800'},contentStyle:{backgroundColor:theme.paper}}}/></SessionProvider>;
}

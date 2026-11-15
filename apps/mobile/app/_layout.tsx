import {Stack} from 'expo-router';
import {SessionProvider} from '../src/session';
import {theme} from '../src/theme';
import {LanguageProvider,useLanguage} from '../src/language';
export default function RootLayout(){
 return <SessionProvider><LanguageProvider><Navigation/></LanguageProvider></SessionProvider>;
}
function Navigation(){
 const {lang}=useLanguage();const es=lang==='es';
 return <Stack screenOptions={{headerStyle:{backgroundColor:theme.paper},headerTintColor:theme.ink,
  headerTitleStyle:{fontWeight:'800'},contentStyle:{backgroundColor:theme.paper}}}>
  {([['index','Viva Blue Salon','Viva Blue Salon'],['services','Services','Servicios'],['service','Your visit','Tu visita'],
   ['my-viva','My Viva','Mi Viva'],['bookings','Appointments','Citas'],['lookbook','Lookbook','Inspiración'],
   ['favorites','Saved looks','Estilos guardados'],['profile','My profile','Mi perfil'],['notifications','Appointment updates','Actualizaciones'],
   ['events','Events','Eventos'],['shop','Products','Productos'],['auth/callback','Sign in','Iniciar sesión']] as const)
   .map(([name,en,spanish])=><Stack.Screen key={name} name={name} options={{title:es?spanish:en}}/>)}
 </Stack>;
}

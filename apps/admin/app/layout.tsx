import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Viva Blue | Salon Studio',description:'Salon operations - secure team workspace'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body>{children}</body></html>;
}

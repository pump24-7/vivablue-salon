import {StyleSheet} from 'react-native';
// Website-referenced visual direction; colors are sampled/approximated for UI, not official HEX standards.
export const theme={
 ink:'#153C63',blue:'#249CF0',blueDark:'#1269B3',lilac:'#D8B3EC',deepLilac:'#9664B0',
 paper:'#F8FCFF',white:'#FFFFFF',rose:'#F8E8F3',mint:'#E5F5FF',muted:'#576E83',
 outline:'#DCEAF5',gold:'#F5CE39',sky:'#E8F6FF'
};
export const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:theme.paper},content:{paddingHorizontal:20,paddingVertical:22,paddingBottom:55},
 brand:{fontSize:38,fontFamily:'serif',fontWeight:'700',color:theme.ink,letterSpacing:-.8},
 heading:{fontSize:29,fontFamily:'serif',fontWeight:'700',color:theme.ink,marginBottom:10},
 subheading:{fontSize:21,fontFamily:'serif',fontWeight:'700',color:theme.ink,marginTop:22,marginBottom:12},
 body:{fontSize:15,color:theme.ink,lineHeight:23},muted:{fontSize:13,color:theme.muted,lineHeight:20},
 overline:{fontSize:10,letterSpacing:2.1,fontWeight:'800',color:theme.blueDark},
 card:{backgroundColor:theme.white,borderColor:theme.outline,borderWidth:1,borderRadius:20,padding:17,marginVertical:7},
 button:{backgroundColor:theme.blueDark,borderRadius:15,paddingVertical:15,paddingHorizontal:18,marginVertical:8,alignItems:'center'},
 buttonText:{color:theme.white,fontSize:15,fontWeight:'800'},
 softButton:{backgroundColor:theme.mint,borderRadius:14,padding:13,marginVertical:5,alignItems:'center'},
 softButtonText:{color:theme.ink,fontSize:14,fontWeight:'700'},
 row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 input:{borderColor:theme.outline,borderWidth:1,borderRadius:12,padding:13,backgroundColor:theme.white,marginVertical:8,fontSize:15,color:theme.ink},
 chip:{borderRadius:15,backgroundColor:theme.white,borderColor:theme.outline,borderWidth:1,padding:14,marginVertical:5},
 selected:{borderColor:theme.blueDark,borderWidth:2,backgroundColor:theme.mint},
 photo:{height:210,width:'100%',borderRadius:18,backgroundColor:theme.lilac},
 panel:{borderRadius:25,padding:22,backgroundColor:theme.lilac,marginVertical:9},
 circle:{width:44,height:44,borderRadius:22,backgroundColor:theme.sky,alignItems:'center',justifyContent:'center'}
});

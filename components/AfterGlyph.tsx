import { StyleSheet, View } from 'react-native';

export type AfterGlyphKind='today'|'week'|'school'|'pending'|'family';

type Props={kind:AfterGlyphKind;active?:boolean;size?:number;surface?:boolean};

export function AfterGlyph({kind,active=false,size=28,surface=true}:Props){
  const ink=active?'#314A38':'#8D8178';
  const accent=active?'#F28B57':'#B9ADA4';
  const scale=size/28;
  return <View style={[s.wrap,surface&&s.surface,active&&surface&&s.surfaceActive,{width:size+10,height:size+8}]}>
    <View style={[s.canvas,{transform:[{scale}]}]}>
      {kind==='today'?<>
        <View style={[s.todayRing,{borderColor:ink}]}/>
        <View style={[s.todayCore,{backgroundColor:accent}]}/>
        <View style={[s.tick,s.tickTop,{backgroundColor:ink}]}/>
        <View style={[s.tick,s.tickRight,{backgroundColor:ink}]}/>
        <View style={[s.tick,s.tickBottom,{backgroundColor:ink}]}/>
      </>:null}
      {kind==='week'?<>
        <View style={[s.weekLine,s.weekA,{backgroundColor:ink}]}/><View style={[s.weekNode,s.weekNodeA,{backgroundColor:accent}]}/>
        <View style={[s.weekLine,s.weekB,{backgroundColor:ink}]}/><View style={[s.weekNode,s.weekNodeB,{backgroundColor:accent}]}/>
        <View style={[s.weekLine,s.weekC,{backgroundColor:ink}]}/><View style={[s.weekNode,s.weekNodeC,{backgroundColor:accent}]}/>
      </>:null}
      {kind==='school'?<>
        <View style={[s.sheetBack,{borderColor:accent}]}/>
        <View style={[s.sheetFront,{borderColor:ink}]}/>
        <View style={[s.scanLine,{backgroundColor:accent}]}/>
        <View style={[s.scanDot,{backgroundColor:ink}]}/>
      </>:null}
      {kind==='pending'?<>
        <View style={[s.pendingLoop,s.pendingLoopA,{borderColor:ink}]}/>
        <View style={[s.pendingLoop,s.pendingLoopB,{borderColor:ink}]}/>
        <View style={[s.pendingDot,{backgroundColor:accent}]}/>
      </>:null}
      {kind==='family'?<>
        <View style={[s.familyLink,s.familyLinkA,{backgroundColor:accent}]}/>
        <View style={[s.familyLink,s.familyLinkB,{backgroundColor:accent}]}/>
        <View style={[s.familyNode,s.familyNodeA,{borderColor:ink}]}/>
        <View style={[s.familyNode,s.familyNodeB,{borderColor:ink}]}/>
        <View style={[s.familyNode,s.familyNodeC,{backgroundColor:accent,borderColor:accent}]}/>
      </>:null}
    </View>
  </View>;
}

export function FamilySignal({size=42}:{size?:number}){
  return <AfterGlyph kind="family" active size={size} surface={false}/>;
}

const s=StyleSheet.create({
  wrap:{alignItems:'center',justifyContent:'center',borderRadius:14},
  surface:{backgroundColor:'transparent'},surfaceActive:{backgroundColor:'#EEF3E9'},
  canvas:{width:28,height:28,position:'relative'},
  todayRing:{position:'absolute',width:13,height:13,borderWidth:2,borderRadius:7,left:7.5,top:7.5},
  todayCore:{position:'absolute',width:4,height:4,borderRadius:2,left:12,top:12},
  tick:{position:'absolute',width:2.2,height:5,borderRadius:2,left:12.9},tickTop:{top:1.5},tickRight:{left:21.5,top:11.5,transform:[{rotate:'90deg'}]},tickBottom:{top:21.5},
  weekLine:{position:'absolute',height:2.2,borderRadius:2},weekA:{width:15,left:5,top:6},weekB:{width:18,left:7,top:13},weekC:{width:13,left:4,top:20},
  weekNode:{position:'absolute',width:5,height:5,borderRadius:3},weekNodeA:{left:18.5,top:4.6},weekNodeB:{left:5.2,top:11.6},weekNodeC:{left:15.4,top:18.6},
  sheetBack:{position:'absolute',width:14,height:17,borderWidth:2,borderRadius:5,left:5,top:4,transform:[{rotate:'-7deg'}]},
  sheetFront:{position:'absolute',width:14,height:17,borderWidth:2,borderRadius:5,left:9,top:7,backgroundColor:'#FFFDF9'},
  scanLine:{position:'absolute',width:8,height:2,borderRadius:2,left:12,top:13},scanDot:{position:'absolute',width:3.5,height:3.5,borderRadius:2,left:11.3,top:9.3},
  pendingLoop:{position:'absolute',width:15,height:8,borderWidth:2,borderRadius:8},pendingLoopA:{left:4,top:6,transform:[{rotate:'-9deg'}]},pendingLoopB:{left:9,top:14,transform:[{rotate:'9deg'}]},pendingDot:{position:'absolute',width:5,height:5,borderRadius:3,left:4,top:18.5},
  familyLink:{position:'absolute',height:2,borderRadius:2,top:13},familyLinkA:{width:10,left:7,transform:[{rotate:'-26deg'}]},familyLinkB:{width:10,left:12,transform:[{rotate:'26deg'}]},
  familyNode:{position:'absolute',width:9,height:9,borderRadius:5,borderWidth:2,backgroundColor:'#FFFDF9'},familyNodeA:{left:2,top:4},familyNodeB:{left:17,top:4},familyNodeC:{left:9.5,top:17,borderWidth:0}
});
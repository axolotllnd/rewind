const physical={Space:'Space',ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',Minus:'Minus',Equal:'Plus',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backquote:'`',NumpadAdd:'numadd',NumpadSubtract:'numsub',NumpadMultiply:'nummult',NumpadDivide:'numdiv',NumpadDecimal:'numdec',NumpadEnter:'numenter'};
export function keyboardAccelerator(event){
 if(['Alt','Control','Shift','Meta'].includes(event.key))return null;
 const code=event.code||'',key=physical[code]||(/^Numpad[0-9]$/.test(code)?'num'+code.slice(-1):null)||(code.startsWith('Key')?code.slice(3):code.startsWith('Digit')?code.slice(5):event.key.length===1?event.key.toUpperCase():event.key);
 const modifiers=[event.ctrlKey?'Control':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,event.metaKey?'Super':null].filter(Boolean);
 return modifiers.length?[...modifiers,key].join('+'):null;
}

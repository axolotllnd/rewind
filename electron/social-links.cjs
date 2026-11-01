const socialLinks=Object.freeze({github:'https://github.com/axolotllnd',telegram:'https://t.me/axolotllnd'});
function socialUrl(id){if(!Object.hasOwn(socialLinks,id))throw Error('Unknown community link');return socialLinks[id];}
module.exports={socialLinks,socialUrl};

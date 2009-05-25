[*



var logoArrayObject = {
	'length' : 0,
	'push' : function(elm) {
		this[this.length] = elm;
		this.length = this.length+1;
	},
	'pop' : function() {
		delete this[this.length-1];
		this.length = this.length-1;
	}
}

function newLogoArr() {
	return clone(logoArrayObject);
}



var cons = {
	global : '.global',
	val : '.val#',
	unset : '.uns#'
}

// State object.
var lstate = {
	// ACTUAL VALUES
	symTables : {
		'.global' : {}
	},
	valTable : {},
	
	// FORMAL DECLARATIONS
	/**
	 * Function table
	 */
	funTable : {},
	
	
	// TEMPORARY STATE TRACKING VARIABLES
	/**
	 * Variable for keeping track of currently executing function.
	 */
	curFun : cons.global,
	
	/**
	 * Variable for keeping track of formal parameters for a function declaration.
	 */
	curParams : newLogoArr(),
	
	/**
	 * Variable for keeping track of currently passed actual parameters of a function invocation.
	 */
	passedParams : 0,
	
	/**
	 * Variable telling whether a termination event has been received (i.e. a return).
	 */
	term : false,
	
	/**
	 * Variable for keeping track of most recent return value.
	 */
	'return' : '',
	
	
}

var origState = clone(lstate);

function resetState() {
	lstate = clone(origState);
}


///////////////////
// STATE OBJECTS //
///////////////////
function NODE() {
	var type;
	var value;
	var children;
}

function FUNC() {
	var name;
	var params;
	var nodes;
}

function VAL() {
	var type;
	var value;
}


/**
 * Function for creating node objects.
 */
function createNode( type, value, children ) {
	var n = new NODE();
	n.type = type;
	n.value = value;	
	n.children = new Array();
	
	for( var i = 2; i < arguments.length; i++ )
		n.children.push( arguments[i] );
		
	return n;
}

/**
 * Function for creating functions.
 */
function createFunction( name, params, nodes ) {
	var f = new FUNC();
	f.name = name;
	f.params = params;
	f.nodes = new Array();
	
	for( var i = 2; i < arguments.length; i++ )
		f.nodes.push( arguments[i] );
		
	return f;
}

/**
 * Function for creating values (constant types, arrays or objects).
 */
function createValue( type, value ) {
	var v = new VAL();
	v.type = type;
	v.value = value;
	
	return v;
}

/**
 * Create a deep clone of a value.
 * 
 * YES, it's expensive!! So is it in PHP.
 */
function clone( value ) {
	if(value == null || typeof(value) != 'object')
		return value;

	var tmp = {};
	for(var key in value)
		tmp[key] = clone(value[key]);

	return tmp;
}



/////////////////
// VAR LINKING //
/////////////////
/**
 * For linking variable references to values, preserving scopes.
 */
var linker = {
	assignVar : function(varName, val, scope) {
		if (!scope)
			scope = lstate.curFun;

		if (typeof(lstate.symTables[scope]) != 'object')
			lstate.symTables[scope] = {};

		var refTable = linker.getRefTableByVal(val);
		var prefix = linker.getConsDefByVal(val);
		
		lstate.symTables[scope][varName] = prefix+scope+'#'+varName

		refTable[scope+'#'+varName] = val;
	},

	getValue : function(varName, scope) {
		if (!scope)
			scope = lstate.curFun;
		
		// Look up the potentially recursively defined variable.
		varName = linker.linkRecursively(varName);
		
		var refTable = linker.getRefTableByVar(varName);
	
		if (typeof(lstate.symTables[scope])=='object' && typeof(lstate.symTables[scope][varName])=='string') {
			var lookupStr = lstate.symTables[scope][varName];
			lookupStr = lookupStr.substr(5,lookupStr.length);
			
			var ret = null;
			ret = clone(refTable[lookupStr]);
			return ret;
		} else if (typeof(lstate.symTables[cons.global])=='string') {
			var lookupStr = lstate.symTables[cons.global][cleanVarName];
			lookupStr = lookupStr.substr(5, lookupStr.length);
			
			var ret = null;
			ret = clone(refTable[lookupStr]);
			return ret;
		}

		//throw varNotFound(varName);
	},


	unlinkVar : function(varName, scope) {
		if (!scope)
			scope = lstate.curFun;
		
		var prefix = linker.getConsDefByVar(varName);
		if (prefix == cons.unset)
			return;
		
		delete lstate.valTable[lstate.symTables[scope][varName]];
		delete lstate.symTables[prefix+scope+'#'+varName];
	},

  // FIXME
  // learn x $y
  // [
  //  echo $y
  // ]
  //
  // learn w $z
  // [
  //  x $z
  // ]
  //
  // w 'foo'
  //
  // this get a folow error: 'value is undefined'
	getRefTableByVal : function(value) {
		// Check for sym type
		switch (value.type) {
			case T_INT:
			case T_FLOAT:
			case T_CONST:
				return lstate.valTable;
			default:
				return null;
		}
	},
	
	getRefTableByConsDef : function(consDef) {
		switch (consDef) {
			case cons.val:
				return lstate.valTable;
			default:
				return null;
		}
	},
	
	getRefTableByVar : function(varName, scope) {
		if (!scope)
			scope = lstate.curFun;
		
		if (typeof(lstate.symTables[scope])!='object')
			lstate.symTables[scope] = {};
		
		// Get symbol name
		var symName = '';
		if (typeof(lstate.symTables[scope][varName])=='string')
			symName = lstate.symTables[scope][varName];
		else if (typeof(lstate.symTables[cons.global][varName])=='string')
			symName = lstate.symTables[cons.global][varName];
		else
			symName = cons.unset;
			
			
		// Check for sym type
		switch (symName.substring(0,5)) {
			case cons.val:
				return lstate.valTable;
			default:
				return null;
		}
	},
	
	linkRecursively : function(varName) {
		if (typeof(varName) != 'string' && varName.type != T_CONST)
			return varName;
		else if (typeof(varName) == 'string') {
			varNameVal = varName;
		} else varNameVal = varName.value;
		
		var firstChar = varNameVal.substring(0,1);
		if (firstChar == "$") {
			varName = linker.getValue( varNameVal.substring( 1,varNameVal.length ) ).value;
		}
		
		return varName;
	},
	
	getConsDefByVal : function(val) {
		var intType = val.type;
		switch (intType) {
			case T_INT:
			case T_FLOAT:
			case T_CONST:
				return cons.val;
			default:
				return null;
		}
	},
	
	getConsDefByVar : function(varName, scope) {
		if (!scope)
			scope = lstate.curFun;
		
		if (typeof(lstate.symTables[scope])!='object')
			lstate.symTables[scope] = {};
		
		// Get symbol name
		var symName = '';
		if (typeof(lstate.symTables[scope][varName])=='string')
			symName = lstate.symTables[scope][varName];
		else if (typeof(lstate.symTables[cons.global][varName])=='string')
			symName = lstate.symTables[cons.global][varName];
		else
			symName = '.unset';
		
		return symName.substring(0,5);
	},
	
	getNumberFromNode : function(node) {
		var num = null;
		switch (node.type) {
			// TODO: Check for PHP-standard.
			case T_INT:
			case T_CONST:
				num = parseInt(node.value);
				break;
			case T_FLOAT:
				num = parseFloat(node.value);
				break;
		}

		return num;
	}
}




/////////////////////////////
// OP AND TYPE DEFINITIONS //
/////////////////////////////

// Value types
var T_CONST   = 0;
var T_INT     = 2;
var T_FLOAT   = 3;

// Node types
var NODE_OP			= 0;
var NODE_VAR		= 1;
var NODE_CONST  = 2;
var NODE_INT    = 3;
var NODE_FLOAT  = 4;

// Op types
var OP_NONE			    = 0;
var OP_ASSIGN		    = 1;
var OP_IF     	    = 2;
var OP_IF_ELSE      = 3;
var OP_WHILE_DO     = 4;
var OP_REPEAT       = 5;
var OP_FCALL    	  = 6;
var OP_PASS_PARAM	  = 7;
var OP_RETURN       = 8;
var OP_ECHO         = 9;

// logo commands
var OP_FORWARD      = 101;
var OP_BACKWARD     = 102;
var OP_TURNLEFT     = 103;
var OP_TURNRIGHT    = 104;
var OP_PENUP        = 105;
var OP_PENDOWN      = 106;
var OP_CLEAR        = 107;
var OP_HOME         = 108;

var OP_EQU         	= 30;
var OP_NEQ          = 31;
var OP_GRT          = 32;
var OP_LOT          = 33;
var OP_GRE          = 34;
var OP_LOE          = 35;
var OP_ADD          = 36;
var OP_SUB          = 37;
var OP_DIV          = 38;
var OP_MUL          = 39;
var OP_NEG          = 40;
var OP_CONCAT       = 41;
var OP_BOOL_NEG   	= 42;



function varNotFound(varName) {
	return 'Variable not found: '+varName;
}

function funNotFound(funName) {
	return 'Function not found: '+funName;
}

function funInvalidArgCount(argCount) {
	return 'Function '+lstate.curFun+'( ) expecting '+argCount+
			' arguments, but only found '+lstate.passedParams+'.';
} 


///////////////
// OPERATORS //
///////////////
var ops = [];

// OP_NONE
ops[OP_NONE] = function(node) {
	if( node.children[0] )
		execute( node.children[0] );
	if( node.children[1] )
		execute( node.children[1] );
};

// OP_ASSIGN
ops[OP_ASSIGN] = function(node) {

	// Look up potentially recursive variable name
	var varName = linker.linkRecursively(node.children[0]);
	
	try {
		var val = execute( node.children[1] );
	} catch(exception) {
		// If we get an undefined variable error, and the undefined variable is the variable
		// we are currently defining, initialize the current variable to 0, and try assigning again.
		if (exception == varNotFound(varName)) {
			execute( createNode( NODE_OP, OP_ASSIGN, varName, createValue( T_INT, 0 ) ) );
			val = execute( node.children[1] );
		} else {
			throw exception;
		}
	}
	
	linker.assignVar( varName, val );
	
	return val;
};

// OP_IF
ops[OP_IF] = function(node) {
	var condChild = execute(node.children[0]);
	if(condChild.value)
		return execute(node.children[1]);
};

// OP_IF_ELSE
ops[OP_IF_ELSE] = function(node) {
	var condChild = execute(node.children[0]);
	if(condChild.value)
		return execute( node.children[1] );
	else
		return execute( node.children[2] );
};

// OP_WHILE_DO
ops[OP_WHILE_DO] = function(node) {
	var tmp = execute( node.children[0] );
	while( tmp.value ) {
		execute( node.children[1] );
		tmp = execute( node.children[0] );
	}
};

// OP_REPEAT
ops[OP_REPEAT] = function(node) {
	var counts = parseInt(execute( node.children[0] ).value);
	for( var i=0; i<counts; i++ )
  {
		execute( node.children[1] );
	}
};


// OP_FORWARD
ops[OP_FORWARD] = function(node) {
	var val = execute( node.children[0] );

  if( val.type == T_INT || val.type == T_FLOAT  )
				Turtle.logo.forward( parseInt(val.value) );
};

// OP_BACKWARD
ops[OP_BACKWARD] = function(node) {
	var val = execute( node.children[0] );

  if( val.type == T_INT || val.type == T_FLOAT  )
				Turtle.logo.backward( parseInt(val.value) );
};

// OP_TURNLEFT
ops[OP_TURNLEFT] = function(node) {
	var val = execute( node.children[0] );

  if( val.type == T_INT || val.type == T_FLOAT  )
				Turtle.logo.left( parseInt(val.value) );
};

// OP_TURNRIGHT
ops[OP_TURNRIGHT] = function(node) {
	var val = execute( node.children[0] );

  if( val.type == T_INT || val.type == T_FLOAT  )
				Turtle.logo.right( parseInt(val.value) );
};

// OP_PENUP
ops[OP_PENUP] = function(node) {
	Turtle.logo.penup();
};

// OP_PENDOWN
ops[OP_PENDOWN] = function(node) {
  Turtle.logo.pendown();
};

// OP_CLEAR
ops[OP_CLEAR] = function(node) {
	Turtle.logo.clear();
};

// OP_HOME
ops[OP_HOME] = function(node) {
  Turtle.logo.home();
};

// OP_FCALL
ops[OP_FCALL] = function (node) {
	// State preservation
	var prevPassedParams = lstate.passedParams;
	lstate.passedParams = 0;

	// Check if function name is recursively defined
	var funName = linker.linkRecursively(node.children[0]);
	
	var prevFun = lstate.curFun;
	
	// Set the name of the function 
	if (funName.type == T_CONST)
		lstate.curFun = funName.value;
	else 
		lstate.curFun = funName;

	// Initialize parameters for the function scope
	if ( node.children[1] )
		execute( node.children[1] );
	
	var f = lstate.funTable[lstate.curFun];
	
	// If f expects no parameters, make sure params' length attribute is set correctly
	if (!f.params.length)
		f.params.length = 0;
	
	// Execute function
	if ( f && f.params.length <= lstate.passedParams ) {
		for ( var i=0; i<f.nodes.length; i++ )
			execute( f.nodes[i] );
	} else {
		if (!f) {
			throw funNotFound(funName);
		} else if (!(f.params.length <= lstate.passedParams))
			throw funInvalidArgCount(f.params.length);
	}
	
	// Clear parameters for the function scope
	for ( var i=0; i<f.params.length; i++ )
		linker.unlinkVar( f.params[i] );
	
	// State roll-back
	lstate.passedParams = prevPassedParams;
	lstate.curFun = prevFun;
	var ret = lstate['return'];
	lstate['return'] = 0;
	
	// Return the value saved in .return in our valTable.
	return ret;
};

// OP_PASS_PARAM
ops[OP_PASS_PARAM] = function(node) {
	// Initialize parameter name
	var f = lstate.funTable[lstate.curFun];

	if (!f)
		throw funNotFound();

	// Link parameter name with passed value
	if ( node.children[0] ) {
		if ( node.children[0].type != 0 ||
				node.children[0].type == 0 && node.children[0].value != OP_PASS_PARAM ) {
			// Initialize parameter name
			var paramName = '';
			if ( lstate.passedParams < f.params.length ) {
				paramName = f.params[lstate.passedParams].value;
			} else
				paramName = '.arg'+lstate.passedParams;

			// Link
			linker.assignVar( paramName, execute( node.children[0] ) );
			lstate.passedParams++;
		} else {
			execute( node.children[0] );
		}
	}
	if ( node.children[1] ) {
		// Initialize parameter name
		var paramName = '';
		if ( lstate.passedParams < f.params.length )
			paramName = f.params[lstate.passedParams].value;
		else
			paramName = '.arg'+lstate.passedParams;
		
		// Link
		linker.assignVar( paramName, execute( node.children[1] ) );
		lstate.passedParams++;
	}
};

// OP_RETURNs
ops[OP_RETURN] = function(node) {
	if (node.children[0])
		lstate['return'] = execute( node.children[0] );
	
	lstate.term = true;
};

// OP_ECHO
ops[OP_ECHO] = function(node) {
	var val = execute( node.children[0] );
	
	if (typeof(val) != 'string' && val) {
		switch (val.type) {
			case T_INT:
			case T_FLOAT:
			case T_CONST:
				alert( val.value );
				break;
		}
	} else {
		alert( val );
	}
};

// OP_EQU
ops[OP_EQU] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var resultNode;
	if (leftChild.value == rightChild.value)
		resultNode = createValue(T_INT, 1);
	else
		resultNode = createValue(T_INT, 0);
	return resultNode;
};

// OP_NEQ
ops[OP_NEQ] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var resultNode;
	if (leftChild.value != rightChild.value)
		resultNode = createValue(T_INT, 1);
	else
		resultNode = createValue(T_INT, 0);
	return resultNode;
};

// OP_GRT
ops[OP_GRT] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var resultNode;
	if (parseInt(leftChild.value) > parseInt(rightChild.value))
		resultNode = createValue(T_INT, 1);
	else
		resultNode = createValue(T_INT, 0);
	return resultNode;
};

// OP_LOT
ops[OP_LOT] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var resultNode;
	if (linker.getNumberFromNode(leftChild) < linker.getNumberFromNode(rightChild))
		resultNode = createValue(T_INT, 1);
	else
		resultNode = createValue(T_INT, 0);

	return resultNode;
};

// OP_GRE
ops[OP_GRE] = function(node) {
			var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var resultNode;
	if (linker.getNumberFromNode(leftChild) >= linker.getNumberFromNode(rightChild))
		resultNode = createValue(T_INT, 1);
	else
		resultNode = createValue(T_INT, 0);
	return resultNode;
};

// OP_LOE
ops[OP_LOE] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var resultNode;
	if (linker.getNumberFromNode(leftChild) <= linker.getNumberFromNode(rightChild))
		resultNode = createValue(T_INT, 1);
	else
		resultNode = createValue(T_INT, 0);
	return resultNode;
},

// OP_ADD
ops[OP_ADD] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var leftValue;
	var rightValue;
	var type = T_INT;
	switch (leftChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
      leftValue = parseInt(leftChild.value);
      break;
		case T_CONST:
			leftValue = leftChild.value;
      type = T_CONST;
			break;
		case T_FLOAT:
			leftValue = parseFloat(leftChild.value);
			type = T_FLOAT;
			break;
	}
	switch (rightChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
      rightValue = parseInt(rightChild.value);
      break;
		case T_CONST:
			rightValue = rightChild.value;
      type = T_CONST;
			break;
		case T_FLOAT:
			rightValue = parseFloat(rightChild.value);
			type = T_FLOAT;
			break;
	}

	var result = leftValue + rightValue;
	var resultNode = createValue(type, result);

	return resultNode;
};

// OP_SUB
ops[OP_SUB] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var leftValue;
	var rightValue;
	var type = T_INT;
	
	switch (leftChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
		case T_CONST:
			leftValue = parseInt(leftChild.value);
			break;
		case T_FLOAT:
			leftValue = parseFloat(leftChild.value);
			type = T_FLOAT;
			break;
	}
	switch (rightChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
		case T_CONST:
			rightValue = parseInt(rightChild.value);
			break;
		case T_FLOAT:
			rightValue = parseFloat(rightChild.value);
			type = T_FLOAT;
			break;
	}

	var result = leftValue - rightValue;
	var resultNode = createValue(type, result);
	
	return resultNode;
};

// OP_DIV
ops[OP_DIV] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var leftValue;
	var rightValue;
	var type = T_INT;
	
	switch (leftChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
		case T_CONST:
			leftValue = parseInt(leftChild.value);
			break;
		case T_FLOAT:
			leftValue = parseFloat(leftChild.value);
			type = T_FLOAT;
			break;
	}
	switch (rightChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
		case T_CONST:
			rightValue = parseInt(rightChild.value);
			break;
		case T_FLOAT:
			rightValue = parseFloat(rightChild.value);
			type = T_FLOAT;
			break;
	}

	var result = leftValue / rightValue;
	var resultNode = createValue(type, result);

	return resultNode;
};

// OP_MUL
ops[OP_MUL] = function(node) {
	var leftChild = execute(node.children[0]);
	var rightChild = execute(node.children[1]);
	var leftValue;
	var rightValue;
	var type = T_INT;
	
	switch (leftChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
		case T_CONST:
			leftValue = parseInt(leftChild.value);
			break;
		case T_FLOAT:
			leftValue = parseFloat(leftChild.value);
			type = T_FLOAT;
			break;
	}
	switch (rightChild.type) {
		// TODO: Check for PHP-standard.
		case T_INT:
		case T_CONST:
			rightValue = parseInt(rightChild.value);
			break;
		case T_FLOAT:
			rightValue = parseFloat(rightChild.value);
			type = T_FLOAT;
			break;
	}

	var result = leftValue * rightValue;
	var resultNode = createValue(type, result);
	
	return resultNode;
};

// OP_NEG
ops[OP_NEG] = function(node) {
	var child = execute(node.children[0]);
	var result = -(child.value);
	var resultNode = createValue(child.type, result);

	return resultNode;
};

// OP_CONCAT
ops[OP_CONCAT] = function(node) {
	var leftChild = execute( node.children[0] );
	var rightChild = execute( node.children[1] );

	return createValue( T_CONST, leftChild.value+rightChild.value );
};

// OP_BOOL_NEG
ops[OP_BOOL_NEG] = function(node) {
	var val = execute( node.children[0] );
	if (val.value) return createNode( NODE_INT, 0 );
	else return createNode( NODE_INT, 1 );
};

function execute( node ) {
	// Reset term-event boolean and terminate currently executing action, if a terminate-event
	// was received.
	if (lstate.term) {
		lstate.term = false;
		return;
	}
	
	var ret = null;
	
	if( !node ) {
		return null;
	}

	switch( node.type ) {
		case NODE_OP:
			var tmp = ops[node.value](node);

			if (tmp && tmp != 'undefined')
				ret = tmp;
			break;
			
		case NODE_VAR:
			ret = linker.getValue( node.value );
			break;
			
		case NODE_CONST:
			ret = createValue( T_CONST, node.value );
			break;
		
		case NODE_INT:
			ret = createValue( T_INT, node.value );
			break;
		
		case NODE_FLOAT:
			ret = createValue( T_FLOAT, node.value );
			break;
	}
	
	return ret;
}
*]

!	' |\n|\r|\t|#[^\n]*'

	"IF"
	"ELSE"
	"WHILE"
  "REPEAT"
	"ECHO"
	"RETURN"
  "LEARN"
  "FORWARD"
  "BACKWARD"
  "TURNLEFT"
  "TURNRIGHT"
  "PENUP"
  "PENDOWN"
  "CLEAR"
  "HOME"
	'{'
	'}'
	'\['
	'\]'
	';'
	','
	'\.'
	'='
	'!'
	'=='
	'!='
	'<!'
	'!>'
	'<='
	'>='
	'>'
	'<'
	'\+'
	'\-'
	'/'
	'\*'
	'\('
	'\)'
	'//'
	'\$[\$a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*'        Variable        [* %match = %match.substr(1,%match.length-1); *]
	'learn [a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*'      FunctionName    [* %match = %match.substr(6,%match.length-1); *]
	'((\'[^\']*\')|("[^"]*"))'                            String          [*  
                                                                          %match = %match.substr(1,%match.length-2);
                                                                          %match = %match.replace( /\\'/g, "'" );
                                                                        *]
	'[0-9]+'                                              Integer
	'true|false'                                          Boolean         [*
                                                                          if (%match == 'true')
                                                                            %match = 1;
                                                                          else 
                                                                            %match = 0;
                                                                        *]
	'[0-9]+\.[0-9]*|[0-9]*\.[0-9]+'                       Float
	'[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*'            Identifier
	;

##

LOGOScript: 	LOGOScript Stmt                                   [* execute( %2 );	*]
    |
		;
		
FunctionDefinition:
			FunctionName FormalParameterList '[' Stmt ']'     [* 	
                                                                  lstate.funTable[%1] =
                                                                  createFunction( %1, lstate.curParams, %4 );
                                                                  // Make sure to clean up param list
                                                                  // for next function declaration
                                                                  lstate.curParams = [];
                                                                *]
		;

SingleStmt:	Return
		|	AssignmentStmt
		|	Expression
		|	IF Expression SingleStmt                                  [* %% = createNode( NODE_OP, OP_IF, %2, %3 ); *]
		|	IF Expression SingleStmt ELSE SingleStmt                  [* %% = createNode( NODE_OP, OP_IF_ELSE,
                                                                                    %2, %3, %5 );
                                                                *]
    | REPEAT Expression SingleStmt                              [* %% = createNode( NODE_OP, OP_REPEAT, %2, %3 ); *]
		|	WHILE Expression SingleStmt                               [* %% = createNode( NODE_OP, OP_WHILE_DO, %2, %3 ); *]
    | LOGONatives
		|	ECHO Expression                                           [* %% = createNode( NODE_OP, OP_ECHO, %2 ); *]
		|	'[' Stmt ']'                                              [* %% = %2; *]
		;
		
Stmt:		Stmt Stmt                                               [* %% = createNode ( NODE_OP, OP_NONE, %1, %2 ); *]
		|	SingleStmt
		|	FunctionDefinition
    ;

AssignmentStmt:
			Variable '=' Expression                                   [* %% = createNode( NODE_OP, OP_ASSIGN, %1, %3 ); *]
		;

		
FormalParameterList:
			FormalParameterList ',' Variable                          [*
                                                                  lstate.curParams.push(createNode( NODE_CONST, %3 ));
                                                                *]
		|	Variable                                                  [*
                                                                  lstate.curParams.push(
                                                                  createNode( NODE_CONST, %1 ));
                                                                *]
		|
		;	

Return:		RETURN Expression                                     [*
                                                                // Create with dummy none node afterwards, so execution
                                                                // will not halt valid sequence.
                                                                  %% = createNode( NODE_OP, OP_NONE,
                                                                                  createNode( NODE_OP, OP_RETURN, %2 ),
                                                                                  createNode(NODE_OP, OP_NONE));
                                                                *]
		|	RETURN                                                    [*
                                                                // Create with dummy none node afterwards, so execution
                                                                // will not halt valid sequence.
                                                                %% = createNode( NODE_OP, OP_NONE,
                                                                createNode( NODE_OP, OP_RETURN ),
                                                                createNode(NODE_OP, OP_NONE));
                                                                *]
		;

ExpressionNotFunAccess:
			BinaryExp
		|	AssignmentStmt
		|	'(' Expression ')'                                        [* %% = %2; *]
		;

LValue:	
		|	VarVal
		;
		
Expression:	ExpressionNotFunAccess
		|	FunctionAccess
		;

LOGONatives:
    FORWARD Expression                                          [* %% = createNode( NODE_OP, OP_FORWARD, %2 ); *]
   | BACKWARD Expression                                          [* %% = createNode( NODE_OP, OP_BACKWARD, %2 ); *]
   | TURNLEFT Expression                                          [* %% = createNode( NODE_OP, OP_TURNLEFT, %2 ); *]
   | TURNRIGHT Expression                                         [* %% = createNode( NODE_OP, OP_TURNRIGHT, %2); *]
   | PENUP                                           [* %% = createNode( NODE_OP, OP_PENUP ); *]
   | PENDOWN                                          [* %% = createNode( NODE_OP, OP_PENDOWN ); *]
   | CLEAR                                          [* %% = createNode( NODE_OP, OP_CLEAR ); *]
   | HOME                                          [* %% = createNode( NODE_OP, OP_HOME ); *]
   ; 

FunctionAccess:
		|	Identifier ActualParameterList 
										                                            [* %% = createNode( NODE_OP, OP_FCALL, %1, %2 ); *]
		;
		
ActualParameterList:
			ActualParameterList ',' Expression
										                                            [* %% = createNode( NODE_OP, OP_PASS_PARAM, %1, %3 ); *]
		|	Expression					                                      [* %% = createNode( NODE_OP, OP_PASS_PARAM, %1 ); *]
		|
		;

BinaryExp:	BinaryExp '==' Expression                           [* %% = createNode( NODE_OP, OP_EQU, %1, %3 ); *]
		|	BinaryExp '<' Expression                                  [* %% = createNode( NODE_OP, OP_LOT, %1, %3 ); *]
		|	BinaryExp '>' Expression                                  [* %% = createNode( NODE_OP, OP_GRT, %1, %3 ); *]
		|	BinaryExp '<=' Expression                                 [* %% = createNode( NODE_OP, OP_LOE, %1, %3 ); *]
		|	BinaryExp '>=' Expression                                 [* %% = createNode( NODE_OP, OP_GRE, %1, %3 ); *]
		|	BinaryExp '!=' Expression                                 [* %% = createNode( NODE_OP, OP_NEQ, %1, %3 ); *]
		|	Expression '.' Expression                                 [* %% = createNode( NODE_OP, OP_CONCAT, %1, %3 ); *]
		|	'(' BinaryExp ')'                                         [* %% = %2; *]
		|	AddSubExp
		;

AddSubExp:	AddSubExp '-' MulDivExp                             [* %% = createNode( NODE_OP, OP_SUB, %1, %3 ); *]
		|	AddSubExp '+' MulDivExp                                   [* %% = createNode( NODE_OP, OP_ADD, %1, %3 ); *]
		|	'(' AddSubExp ')'                                         [* %% = %2; *]
		|	MulDivExp
		;
		
MulDivExp:	MulDivExp '*' UnaryExp                              [* %% = createNode( NODE_OP, OP_MUL, %1, %3 ); *]
		|	MulDivExp '/' UnaryExp                                    [* %% = createNode( NODE_OP, OP_DIV, %1, %3 ); *]
		|	'(' MulDivExp ')'                                         [* %% = %2; *]
		|	UnaryExp
		;
				
UnaryExp:	'-' Value                                             [* %% = createNode( NODE_OP, OP_NEG, %2 ); *]
		|	'!' Expression                                            [* %% = createNode( NODE_OP, OP_BOOL_NEG, %2 ); *]
		|	Value
		;

VarVal:		Variable                                              [* %% = createNode( NODE_VAR, %1 ); *]
		;

Value:		VarVal			
		|	String                                                    [* %% = createNode( NODE_CONST, %1 ); *]
		|	Integer                                                   [* %% = createNode( NODE_INT, %1 ); *]
		|	Boolean                                                   [* %% = createNode( NODE_INT, %1 ); *]
		|	Float                                                     [* %% = createNode( NODE_FLOAT, %1 ); *]
		|	LValue
		;

[*

Turtle.run = function(str) {
	var error_cnt 	= 0;
	var error_off	= new Array();
	var error_la	= new Array();
	
	if( ( error_cnt = __parse( str, error_off, error_la ) ) > 0 ) {
		for(var i=0; i<error_cnt; i++)
			alert( "Parse error near >" 
				+ str.substr( error_off[i], 30 ) + "<, expecting \"" + error_la[i].join() + "\"<br/>\n" );
	}
};

*]

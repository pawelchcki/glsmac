#include "InputFixture.h"

#include <memory>
#include "ui/dom/InputState.h"
#include "gse/Exception.h"
#include "gse/callable/Native.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"
#include "gse/value/String.h"

namespace gse::tests::mocks {

static input::key_code_t ParseKeyCode( GSE_CALLABLE, const std::string& code ) {
	if ( code == "NONE" ) { return input::K_NONE; }
#define X_KEY_CODE_1( name ) if ( code == #name ) { return input::K_##name; }
#define X_KEY_CODE_2( name, sdl ) X_KEY_CODE_1( name )
#define X_KEY_CODE_3( name, sdl1, sdl2 ) X_KEY_CODE_1( name )
	X_KEY_CODES
#undef X_KEY_CODE_1
#undef X_KEY_CODE_2
#undef X_KEY_CODE_3
	GSE_ERROR( EC.INVALID_CALL, "Unknown native input key code" );
}

// Raw key descriptors and clipboard contents replace only platform input.
// All value transitions execute the state owned by the real native Input.
Value* MakeInputState( GSE_CALLABLE, const std::string& initial_value, const size_t max_length ) {
	const auto state = std::make_shared< ::ui::dom::InputState >();
	state->SetMaxLength( max_length );
	state->SetValue( initial_value );
	const value::object_properties_t properties = {
		{ "get_value", NATIVE_CALL( state ) {
			N_EXPECT_ARGS( 0 );
			return VALUE( value::String,, state->GetValue() );
		} ) },
		{ "set_value", NATIVE_CALL( state ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( text, 0, String );
			return VALUE( value::Bool,, state->SetValue( text ) );
		} ) },
		{ "key_down", NATIVE_CALL( state ) {
			N_EXPECT_ARGS( 4 );
			N_GETVALUE( code, 0, String ); N_GETVALUE( printable, 1, String );
			N_GETVALUE( modifiers, 2, Int ); N_GETVALUE( clipboard, 3, String );
			if ( printable.size() > 1 || modifiers < 0 || modifiers > 7 ) { GSE_ERROR( EC.INVALID_CALL, "Expected zero/one printable byte and modifier bits 0..7" ); }
			const auto key_code = ParseKeyCode( GSE_CALL, code );
			const auto result = state->KeyDown( key_code, !printable.empty(), printable.empty() ? 0 : printable[ 0 ], input::key_modifier_t( modifiers ), clipboard );
			return VALUEEXT( value::Object, GSE_CALL, {
				{ "handled", VALUE( value::Bool,, result.handled ) },
				{ "changed", VALUE( value::Bool,, result.changed ) },
				{ "submitted", VALUE( value::Bool,, result.submitted ) },
				{ "value", VALUE( value::String,, state->GetValue() ) },
			} );
		} ) },
	};
	return VALUEEXT( value::Object, GSE_CALL, properties );
}

}

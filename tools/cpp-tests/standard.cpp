#include <cstdint>
#include <iostream>
#include <string_view>
#include <type_traits>
#include <utility>

// Deliberately small shared library floor. New C++23 facilities need their own
// native/Windows/Emscripten checks before production adoption.
enum class Command : std::uint8_t { stop = 3 };
static_assert( __cplusplus > 202002L );
static_assert( std::is_scoped_enum_v< Command > );
static_assert( std::to_underlying( Command::stop ) == 3 );
static_assert( std::string_view( "GLSMAC" ).contains( "SMAC" ) );

int main() {
	std::cout << "C++ " << __cplusplus;
#ifdef _LIBCPP_VERSION
	std::cout << "; libc++ " << _LIBCPP_VERSION;
#elif defined( __GLIBCXX__ )
	std::cout << "; libstdc++ " << __GLIBCXX__;
#elif defined( _MSVC_STL_VERSION )
	std::cout << "; MSVC STL " << _MSVC_STL_VERSION;
#endif
	std::cout << "\n";
	return 0;
}

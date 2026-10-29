#pragma once

#include <chrono>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>

#include "Value.h"

namespace script {

class Error : public std::runtime_error {
public:
	using std::runtime_error::runtime_error;
	Error( const std::string& message, std::string name, std::string reason, std::string stack )
		: std::runtime_error( message )
		, m_name( std::move( name ) )
		, m_reason( std::move( reason ) )
		, m_stack( std::move( stack ) ) {}
	const std::string& Name() const { return m_name; }
	const std::string& Reason() const { return m_reason; }
	const std::string& Stack() const { return m_stack; }

private:
	std::string m_name = {};
	std::string m_reason = {};
	std::string m_stack = {};
};

struct Limits {
	size_t memory_bytes = 64 * 1024 * 1024;
	size_t stack_bytes = 1024 * 1024;
	std::chrono::milliseconds execution = std::chrono::milliseconds( 200 );
};

// Each runtime belongs to its constructing thread. Modules see immutable copies
// and return checked values; commits, RNG, scheduling and native lifetimes stay
// with the host. The loader reads only files declared by one generated package.
class Runtime {
public:
	using Reader = std::function< std::string( const std::string& ) >;
	Runtime( const std::string& manifest, Reader reader, Limits limits = {} );
	~Runtime();
	Runtime( const Runtime& ) = delete;
	Runtime& operator=( const Runtime& ) = delete;
	Value Call( const std::string& module, const std::string& function, const Value& input );
	std::string PackageIdentity() const;
	static std::string Version();

private:
	struct Impl;
	std::unique_ptr< Impl > m_impl;
};

}// namespace script

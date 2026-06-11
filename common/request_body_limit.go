package common

import "github.com/QuantumNous/new-api/constant"

const defaultAnonymousRequestBodyLimitKB = 512
const defaultApiRequestLogBodySizeKB = 64
const defaultApiRequestLogRequestCompactionLimitMB = 10

func GetAnonymousRequestBodyLimitBytes() int64 {
	limitKB := constant.AnonymousRequestBodyLimitKB
	if limitKB < 0 {
		limitKB = defaultAnonymousRequestBodyLimitKB
	}
	return int64(limitKB) << 10
}

func GetApiRequestLogBodyLimitBytes() int64 {
	limitKB := ApiRequestLogBodySizeKB
	if limitKB < 0 {
		limitKB = defaultApiRequestLogBodySizeKB
	}
	return int64(limitKB) << 10
}

func GetApiRequestLogRequestCompactionLimitBytes() int64 {
	limitMB := ApiRequestLogRequestCompactionLimitMB
	if limitMB < 0 {
		limitMB = defaultApiRequestLogRequestCompactionLimitMB
	}
	return int64(limitMB) << 20
}

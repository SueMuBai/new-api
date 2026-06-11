package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

type ApiRequestLog struct {
	LogID        int    `json:"log_id" gorm:"column:log_id;primaryKey;autoIncrement:false"`
	RequestBody  string `json:"request_body" gorm:"type:text"`
	ResponseBody string `json:"response_body" gorm:"type:text"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint;index"`
}

type ApiRequestLogWithUsage struct {
	ID                int    `json:"id" gorm:"-"`
	LogID             int    `json:"log_id" gorm:"column:log_id"`
	CreatedAt         int64  `json:"created_at" gorm:"column:created_at"`
	RequestBody       string `json:"request_body" gorm:"column:request_body"`
	ResponseBody      string `json:"response_body" gorm:"column:response_body"`
	UserId            int    `json:"user_id" gorm:"column:user_id"`
	Username          string `json:"username" gorm:"column:username"`
	TokenId           int    `json:"token_id" gorm:"column:token_id"`
	TokenName         string `json:"token_name" gorm:"column:token_name"`
	ModelName         string `json:"model_name" gorm:"column:model_name"`
	ChannelId         int    `json:"channel_id" gorm:"column:channel_id"`
	Method            string `json:"method" gorm:"-"`
	Path              string `json:"path" gorm:"-"`
	Query             string `json:"query" gorm:"-"`
	StatusCode        int    `json:"status_code" gorm:"-"`
	Ip                string `json:"ip" gorm:"column:ip"`
	UseTime           int    `json:"use_time" gorm:"column:use_time"`
	IsStream          bool   `json:"is_stream" gorm:"column:is_stream"`
	RequestId         string `json:"request_id,omitempty" gorm:"column:request_id"`
	UpstreamRequestId string `json:"upstream_request_id,omitempty" gorm:"column:upstream_request_id"`
	Other             string `json:"-" gorm:"column:other"`
	RequestTruncated  bool   `json:"request_truncated" gorm:"-"`
	ResponseTruncated bool   `json:"response_truncated" gorm:"-"`
}

type ApiRequestLogQueryParams struct {
	UserID            *int
	Username          string
	TokenName         string
	ModelName         string
	ChannelID         *int
	Path              string
	StatusCode        *int
	RequestID         string
	UpstreamRequestID string
	StartTimestamp    int64
	EndTimestamp      int64
}

func RecordApiRequestLog(log *ApiRequestLog) {
	if log == nil || log.LogID == 0 {
		return
	}
	if log.CreatedAt == 0 {
		log.CreatedAt = common.GetTimestamp()
	}
	if err := LOG_DB.Create(log).Error; err != nil {
		common.SysLog("failed to record api request log: " + err.Error())
	}
}

func buildApiRequestLogQuery(params ApiRequestLogQueryParams) (*gorm.DB, bool) {
	if params.StatusCode != nil && *params.StatusCode != 200 {
		return nil, false
	}

	tx := LOG_DB.Table("api_request_logs").
		Joins("JOIN logs ON logs.id = api_request_logs.log_id").
		Where("logs.type = ?", LogTypeConsume)

	if params.UserID != nil {
		tx = tx.Where("logs.user_id = ?", *params.UserID)
	}
	if params.Username != "" {
		tx = tx.Where("logs.username = ?", params.Username)
	}
	if params.TokenName != "" {
		tx = tx.Where("logs.token_name = ?", params.TokenName)
	}
	if params.ModelName != "" {
		tx = tx.Where("logs.model_name = ?", params.ModelName)
	}
	if params.ChannelID != nil {
		tx = tx.Where("logs.channel_id = ?", *params.ChannelID)
	}
	if params.Path != "" {
		tx = tx.Where("logs.other LIKE ?", "%"+params.Path+"%")
	}
	if params.RequestID != "" {
		tx = tx.Where("logs.request_id = ?", params.RequestID)
	}
	if params.UpstreamRequestID != "" {
		tx = tx.Where("logs.upstream_request_id = ?", params.UpstreamRequestID)
	}
	if params.StartTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", params.StartTimestamp)
	}
	if params.EndTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", params.EndTimestamp)
	}

	return tx, true
}

func selectApiRequestLogWithUsage(tx *gorm.DB) *gorm.DB {
	return tx.Select(
		"api_request_logs.log_id",
		"api_request_logs.created_at",
		"api_request_logs.request_body",
		"api_request_logs.response_body",
		"logs.user_id",
		"logs.username",
		"logs.token_id",
		"logs.token_name",
		"logs.model_name",
		"logs.channel_id",
		"logs.ip",
		"logs.use_time",
		"logs.is_stream",
		"logs.request_id",
		"logs.upstream_request_id",
		"logs.other",
	)
}

func formatApiRequestLogs(logs []*ApiRequestLogWithUsage) {
	for _, log := range logs {
		log.ID = log.LogID
		log.StatusCode = 200
		log.RequestTruncated = strings.HasSuffix(log.RequestBody, "\n[truncated]")
		log.ResponseTruncated = strings.HasSuffix(log.ResponseBody, "\n[truncated]")

		otherMap, _ := common.StrToMap(log.Other)
		if otherMap == nil {
			continue
		}
		if path, ok := otherMap["request_path"].(string); ok {
			log.Path = path
		}
	}
}

func GetApiRequestLogs(startIdx int, num int, params ApiRequestLogQueryParams) ([]*ApiRequestLogWithUsage, int64, error) {
	var logs []*ApiRequestLogWithUsage
	var total int64

	tx, ok := buildApiRequestLogQuery(params)
	if !ok {
		return logs, 0, nil
	}

	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := selectApiRequestLogWithUsage(tx).
		Order("api_request_logs.created_at desc, api_request_logs.log_id desc").
		Limit(num).
		Offset(startIdx).
		Scan(&logs).Error; err != nil {
		return nil, 0, err
	}

	formatApiRequestLogs(logs)
	return logs, total, nil
}

func GetApiRequestLogByLogID(logID int) (*ApiRequestLogWithUsage, error) {
	var logs []*ApiRequestLogWithUsage
	tx := LOG_DB.Table("api_request_logs").
		Joins("JOIN logs ON logs.id = api_request_logs.log_id").
		Where("api_request_logs.log_id = ? AND logs.type = ?", logID, LogTypeConsume)

	if err := selectApiRequestLogWithUsage(tx).Limit(1).Scan(&logs).Error; err != nil {
		return nil, err
	}
	if len(logs) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	formatApiRequestLogs(logs)
	return logs[0], nil
}

func DeleteApiRequestLogsBefore(targetTimestamp int64) (int64, error) {
	if targetTimestamp <= 0 {
		return 0, nil
	}
	result := LOG_DB.Where("created_at < ?", targetTimestamp).Delete(&ApiRequestLog{})
	return result.RowsAffected, result.Error
}

func UpdateUserApiRequestLogEnabled(userId int, enabled bool) error {
	if err := DB.Model(&User{}).Where("id = ?", userId).Update("api_request_log_enabled", enabled).Error; err != nil {
		return err
	}
	return invalidateUserCache(userId)
}

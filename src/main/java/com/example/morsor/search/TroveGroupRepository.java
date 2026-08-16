package com.example.morsor.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class TroveGroupRepository {

    private final JdbcTemplate jdbc;

    public TroveGroupRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<TroveGroupRow> GROUP_MAPPER = (rs, rowNum) ->
            new TroveGroupRow(
                    rs.getString("id"),
                    rs.getString("name"),
                    rs.getTimestamp("updated_at").toInstant().toString());

    private static final RowMapper<TroveGroupMemberRow> MEMBER_MAPPER = (rs, rowNum) ->
            new TroveGroupMemberRow(rs.getString("group_id"), rs.getString("trove_id"));

    public List<TroveGroupRow> findAllGroups() {
        return jdbc.query(
                "SELECT id, name, updated_at FROM trove_groups ORDER BY LOWER(name)",
                GROUP_MAPPER);
    }

    public Optional<TroveGroupRow> findGroupById(String id) {
        List<TroveGroupRow> rows = jdbc.query(
                "SELECT id, name, updated_at FROM trove_groups WHERE id = ?",
                GROUP_MAPPER,
                id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<TroveGroupMemberRow> findAllMembers() {
        return jdbc.query(
                "SELECT group_id, trove_id FROM trove_group_members ORDER BY created_at, trove_id",
                MEMBER_MAPPER);
    }

    public List<TroveGroupMemberRow> findMembersByGroupId(String groupId) {
        return jdbc.query(
                "SELECT group_id, trove_id FROM trove_group_members WHERE group_id = ? ORDER BY created_at, trove_id",
                MEMBER_MAPPER,
                groupId);
    }

    public void insertGroup(String id, String name) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(
                "INSERT INTO trove_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                id,
                name,
                now,
                now);
    }

    /** @return rows deleted (0 or 1) */
    public int deleteGroup(String id) {
        return jdbc.update("DELETE FROM trove_groups WHERE id = ?", id);
    }

    /** @return rows updated (0 or 1) */
    public int updateGroupName(String id, String name) {
        return jdbc.update(
                "UPDATE trove_groups SET name = ?, updated_at = ? WHERE id = ?",
                name,
                Timestamp.from(Instant.now()),
                id);
    }

    /** Bump a group's updated_at (e.g. after its members change) without touching its name. */
    public void touchGroup(String id) {
        jdbc.update(
                "UPDATE trove_groups SET updated_at = ? WHERE id = ?",
                Timestamp.from(Instant.now()),
                id);
    }

    public void insertMember(String groupId, String troveId) {
        jdbc.update(
                "INSERT INTO trove_group_members (group_id, trove_id, created_at) VALUES (?, ?, ?)",
                groupId,
                troveId,
                Timestamp.from(Instant.now()));
    }

    /** @return rows deleted (0 or 1) */
    public int deleteMember(String groupId, String troveId) {
        return jdbc.update(
                "DELETE FROM trove_group_members WHERE group_id = ? AND trove_id = ?",
                groupId,
                troveId);
    }
}
